const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const models = require('../src/models/bk');

const id = () => new mongoose.Types.ObjectId();
const date = (time) => new Date(`2026-10-01T${time}:00+07:00`);
const event = () => ({ name: 'Booking event', slug: 'booking-event', created_by: id() });
const booking = () => ({
  event_id: id(), contact_name: 'Guest', contact_phone: '0812345678',
  attendee_count: 4, total_amount_satang: 200000,
  payment_due_at: date('12:30'), hold_expires_at: date('12:30'),
});

async function invalid(Model, fields, path) {
  await assert.rejects(new Model(fields).validate(), error => {
    assert.ok(error.errors[path], `Expected validation error at ${path}: ${error.message}`);
    return true;
  });
}

test('all model names, collections and references stay inside the bk_ namespace', () => {
  assert.equal(Object.keys(models).length, 18);
  for (const [name, Model] of Object.entries(models)) {
    assert.ok(name.startsWith('bk_'));
    assert.equal(Model.modelName, name);
    assert.equal(Model.collection.name, name);
    Model.schema.eachPath((path, type) => {
      if (type.options.ref) assert.ok(models[type.options.ref], `${name}.${path} has an unresolved reference`);
    });
    if (name !== 'bk_login_limits') assert.ok(Model.schema.path('created_at'));
    // Expiry must release inventory transactionally, never TTL-delete booking history.
    if (!['bk_sessions', 'bk_login_limits'].includes(name)) assert.ok(Model.schema.indexes().every(([, options]) => options.expireAfterSeconds === undefined));
  }
});

test('draft event allows incomplete scheduling, scheduled event requires complete dates', async () => {
  await new models.bk_events(event()).validate();
  await invalid(models.bk_events, { ...event(), status: 'scheduled' }, 'starts_at');
  await new models.bk_events({
    ...event(), status: 'scheduled', publish_at: date('08:00'), booking_opens_at: date('09:00'),
    booking_closes_at: date('12:00'), starts_at: date('18:00'), ends_at: date('22:00'),
  }).validate();
});

test('rejects reversed event times, unpublished booking windows, and invalid time zones', async () => {
  await invalid(models.bk_events, { ...event(), starts_at: date('20:00'), ends_at: date('18:00') }, 'ends_at');
  await invalid(models.bk_events, { ...event(), booking_opens_at: date('12:00'), booking_closes_at: date('11:00') }, 'booking_closes_at');
  await invalid(models.bk_events, { ...event(), timezone: 'not-a-timezone' }, 'timezone');
  await invalid(models.bk_events, {
    ...event(), status: 'scheduled', publish_at: date('10:00'), booking_opens_at: date('09:00'),
    booking_closes_at: date('12:00'), starts_at: date('18:00'), ends_at: date('22:00'),
  }, 'booking_opens_at');
});

test('money is non-negative safe integer satang and capacity is a positive integer', async () => {
  const fields = { event_id: id(), name: 'Standard', capacity: 4, price_satang: 200000 };
  await new models.bk_event_table_types(fields).validate();
  for (const value of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await invalid(models.bk_event_table_types, { ...fields, price_satang: value }, 'price_satang');
  }
  for (const value of [0, -1, 1.5]) {
    await invalid(models.bk_event_table_types, { ...fields, capacity: value }, 'capacity');
  }
  await invalid(models.bk_event_table_types, { ...fields, currency: 'USD' }, 'currency');
});

test('guest bookings retain contact details without requiring a member account', async () => {
  const document = new models.bk_bookings(booking());
  await document.validate();
  assert.equal(document.user_id, null);
  assert.match(document.booking_no, /^BK-/);
  await invalid(models.bk_bookings, { ...booking(), contact_phone: '' }, 'contact_phone');
});

test('booking lifecycle requires hold, confirmation and cancellation timestamps', async () => {
  await invalid(models.bk_bookings, { ...booking(), hold_expires_at: null }, 'hold_expires_at');
  await invalid(models.bk_bookings, { ...booking(), status: 'confirmed' }, 'confirmed_at');
  await invalid(models.bk_bookings, { ...booking(), status: 'cancelled' }, 'cancelled_at');
  await new models.bk_bookings({ ...booking(), status: 'payment_review', hold_expires_at: null }).validate();
  await new models.bk_bookings({ ...booking(), status: 'confirmed', confirmed_at: date('13:00'), hold_expires_at: null }).validate();
});

test('booking line total must match integer quantity and captured price', async () => {
  const fields = { booking_id: id(), table_type_id: id(), quantity: 2, unit_price_satang: 200000, capacity_per_table: 4, line_total_satang: 400000 };
  await new models.bk_booking_items(fields).validate();
  await invalid(models.bk_booking_items, { ...fields, line_total_satang: 200000 }, 'line_total_satang');
  await invalid(models.bk_booking_items, { ...fields, quantity: 1.5 }, 'quantity');
});

test('canvas dimensions and positions validate while template and event parents stay separate', async () => {
  const fields = { template_id: id(), kind: 'chair', parent_object_id: id(), x: 10, y: 20, width: 20, height: 20 };
  await new models.bk_template_objects(fields).validate();
  await invalid(models.bk_template_objects, { ...fields, width: 0 }, 'width');
  await invalid(models.bk_template_objects, { ...fields, x: Infinity }, 'x');
  assert.equal(models.bk_template_objects.schema.path('parent_object_id').options.ref, 'bk_template_objects');
  assert.equal(models.bk_event_layout_objects.schema.path('parent_object_id').options.ref, 'bk_event_layout_objects');
});

test('active table assignment has a partial unique index and release cannot precede assignment', async () => {
  const index = models.bk_table_assignments.schema.indexes().find(([keys]) => keys.event_table_id === 1);
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[1].partialFilterExpression, { released_at: null });
  const fields = { booking_item_id: id(), event_table_id: id(), assigned_at: date('12:00') };
  await new models.bk_table_assignments(fields).validate();
  await invalid(models.bk_table_assignments, { ...fields, released_at: date('11:00') }, 'released_at');
});

test('payment decisions require reviewer metadata and rejection reason', async () => {
  const fields = { booking_id: id(), slip_file_id: id(), submitted_amount_satang: 200000, transferred_at: date('12:00') };
  await new models.bk_payment_submissions(fields).validate();
  await invalid(models.bk_payment_submissions, { ...fields, status: 'approved' }, 'reviewed_by');
  await invalid(models.bk_payment_submissions, { ...fields, status: 'approved', reviewed_by: id() }, 'reviewed_at');
  await invalid(models.bk_payment_submissions, { ...fields, status: 'rejected', reviewed_by: id(), reviewed_at: date('13:00') }, 'review_note');
  await new models.bk_payment_submissions({ ...fields, status: 'approved', reviewed_by: id(), reviewed_at: date('13:00') }).validate();
  const index = models.bk_payment_submissions.schema.indexes().find(([, options]) => options.name === 'bk_one_approved_payment_per_booking');
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[1].partialFilterExpression, { status: 'approved' });
});

test('waitlist offers require an inventory-reserving booking and deadline', async () => {
  const fields = { event_id: id(), table_type_id: id(), contact_name: 'Guest', contact_phone: '0812345678', quantity: 1, attendee_count: 4 };
  await new models.bk_waitlist_entries(fields).validate();
  await invalid(models.bk_waitlist_entries, { ...fields, status: 'offered' }, 'offered_booking_id');
  await invalid(models.bk_waitlist_entries, { ...fields, status: 'offered', offered_booking_id: id() }, 'offer_expires_at');
  await new models.bk_waitlist_entries({ ...fields, status: 'offered', offered_booking_id: id(), offer_expires_at: date('13:00') }).validate();
});

test('files are private by default and check-in counts reject zero or fractional guests', async () => {
  const file = new models.bk_files({ storage_key: 'slips/example', original_name: 'slip.png', mime_type: 'image/png', size_bytes: 100 });
  await file.validate();
  assert.equal(file.access_level, 'private');
  for (const guest_count of [0, -1, 0.5]) {
    await invalid(models.bk_check_ins, { booking_id: id(), checked_in_by: id(), guest_count }, 'guest_count');
  }
});
