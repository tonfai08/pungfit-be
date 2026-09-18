const express = require('express');
const {
  models,
  z,
  objectId,
  text,
  integer,
  date,
  requireValue,
  withEvent,
  findOrFail,
  audit,
} = require('../services/bk-common');
const {
  activeStatuses,
  bookingInput,
  reservedQuantity,
  reservedAttendees,
  createBooking,
  assignTables,
} = require('../services/bk-booking');
const router = express.Router();
router.get('/events/:id/inventory', async (req, res) => {
  objectId.parse(req.params.id);
  const event = await findOrFail(models.bk_events, { _id: req.params.id });
  if (event.booking_mode === 'capacity') {
    const reserved = await reservedAttendees(event._id);
    return res.json({ booking_mode: 'capacity', types: [], tables: [], assignments: [],
      capacity: { total: event.capacity_limit, reserved, available: Math.max(0, event.capacity_limit - reserved),
        max_attendees_per_booking: event.max_attendees_per_booking,
        price_per_attendee_satang: event.payment_required === false ? 0 : event.price_per_attendee_satang || 0 } });
  }
  const types = await models.bk_event_table_types
    .find({ event_id: req.params.id })
    .lean();
  for (const type of types) {
    if (event.payment_required === false) type.price_satang = 0;
    type.total = await models.bk_event_tables.countDocuments({
      event_id: req.params.id,
      table_type_id: type._id,
      is_bookable: true,
    });
    type.reserved = await reservedQuantity(req.params.id, type._id);
    type.available = Math.max(0, type.total - type.reserved);
  }
  const tables = await models.bk_event_tables
    .find({ event_id: req.params.id })
    .sort({ code: 1 })
    .lean();
  const assignments = await models.bk_table_assignments
    .find({
      event_table_id: { $in: tables.map((table) => table._id) },
      released_at: null,
    })
    .lean();
  const items = await models.bk_booking_items.find({
    _id: { $in: assignments.map((entry) => entry.booking_item_id) },
  }).lean();
  const bookings = await models.bk_bookings.find({
    _id: { $in: items.map((item) => item.booking_id) },
    event_id: req.params.id,
    $or: [
      { status: { $in: ['confirmed', 'payment_review'] } },
      { status: 'pending_payment', hold_expires_at: { $gt: new Date() } },
    ],
  }).select('_id user_id booking_no contact_name contact_phone contact_x_account status').lean();
  const live = assignments.flatMap((entry) => {
    const item = items.find((item) => String(item._id) === String(entry.booking_item_id));
    const booking = bookings.find((booking) => String(booking._id) === String(item?.booking_id));
    return booking ? [{ ...entry, booking }] : [];
  });
  res.json({ types, tables, assignments: live });
});
router.get('/events/:id/bookings', async (req, res) => {
  objectId.parse(req.params.id);
  res.json(
    await models.bk_bookings
      .find({ event_id: req.params.id })
      .sort({ created_at: -1 })
      .limit(500),
  );
});
router.post('/events/:id/bookings', async (req, res) => {
  const input = bookingInput.parse(req.body);
  res
    .status(201)
    .json(
      await withEvent(
        req.params.id,
        req.bkUser,
        'create_booking',
        (event, session) => createBooking(event, input, req.bkUser, session),
      ),
    );
});
router.get('/events/:id/bookings/:bookingId', async (req, res) => {
  objectId.parse(req.params.id);
  objectId.parse(req.params.bookingId);
  const booking = await findOrFail(models.bk_bookings, {
    _id: req.params.bookingId,
    event_id: req.params.id,
  });
  const items = await models.bk_booking_items
    .find({ booking_id: booking._id })
    .populate('table_type_id');
  const assignments = await models.bk_table_assignments
    .find({
      booking_item_id: { $in: items.map((item) => item._id) },
      released_at: null,
    })
    .populate('event_table_id');
  const payments = await models.bk_payment_submissions
    .find({ booking_id: booking._id })
    .sort({ submitted_at: -1 });
  const check_ins = await models.bk_check_ins
    .find({ booking_id: booking._id })
    .sort({ checked_in_at: -1 });
  res.json({ booking, items, assignments, payments, check_ins });
});
router.post('/events/:id/bookings/:bookingId/cancel', async (req, res) => {
  objectId.parse(req.params.bookingId);
  const input = z
    .object({ reason: text(2000).min(1) })
    .strict()
    .parse(req.body);
  res.json(
    await withEvent(
      req.params.id,
      req.bkUser,
      'cancel_booking',
      async (event, session) => {
        const booking = await findOrFail(
          models.bk_bookings,
          { _id: req.params.bookingId, event_id: event._id },
          session,
        );
        requireValue(
          activeStatuses.includes(booking.status),
          'รายการนี้ยกเลิกหรือหมดอายุแล้ว',
          409,
        );
        requireValue(
          !(await models.bk_check_ins
            .exists({ booking_id: booking._id })
            .session(session)),
          'รายการนี้เช็กอินแล้ว ยกเลิกไม่ได้',
          409,
        );
        booking.status = 'cancelled';
        booking.cancelled_at = new Date();
        booking.cancellation_reason = input.reason;
        booking.hold_expires_at = null;
        await booking.save({ session });
        await models.bk_waitlist_entries.updateMany(
          {
            offered_booking_id: booking._id,
            status: { $in: ['offered', 'converted'] },
          },
          { $set: { status: 'cancelled' } },
          { session },
        );
        const items = await models.bk_booking_items
          .find({ booking_id: booking._id })
          .session(session);
        await models.bk_table_assignments.updateMany(
          {
            booking_item_id: { $in: items.map((item) => item._id) },
            released_at: null,
          },
          { $set: { released_at: new Date(), release_reason: input.reason } },
          { session },
        );
        await audit(req.bkUser, 'cancel_booking', booking, event._id, session, {
          reason: input.reason,
        });
        return booking;
      },
    ),
  );
});
router.put(
  '/events/:id/bookings/:bookingId/assignments/:itemId',
  async (req, res) => {
    objectId.parse(req.params.bookingId);
    objectId.parse(req.params.itemId);
    const input = z
      .object({ table_ids: z.array(objectId).max(1000) })
      .strict()
      .parse(req.body);
    await withEvent(
      req.params.id,
      req.bkUser,
      'assign_tables',
      async (event, session) => {
        const booking = await findOrFail(
          models.bk_bookings,
          { _id: req.params.bookingId, event_id: event._id },
          session,
        );
        const item = await findOrFail(
          models.bk_booking_items,
          { _id: req.params.itemId, booking_id: booking._id },
          session,
        );
        await assignTables(
          event,
          booking,
          item,
          input.table_ids,
          req.bkUser,
          session,
        );
        await audit(req.bkUser, 'assign_tables', booking, event._id, session, {
          table_ids: input.table_ids,
        });
      },
    );
    res.json({ ok: true });
  },
);
router.post('/events/:id/bookings/:bookingId/payments', async (req, res) => {
  objectId.parse(req.params.bookingId);
  const input = z
    .object({
      slip_file_id: objectId,
      submitted_amount_satang: integer(1),
      transferred_at: date,
      transaction_reference: text(150).optional(),
    })
    .strict()
    .parse(req.body);
  res.status(201).json(
    await withEvent(
      req.params.id,
      req.bkUser,
      'submit_payment',
      async (event, session) => {
        const booking = await findOrFail(
          models.bk_bookings,
          { _id: req.params.bookingId, event_id: event._id },
          session,
        );
        requireValue(
          booking.status === 'pending_payment',
          'ส่งหลักฐานได้เฉพาะรายการที่รอชำระและยังไม่หมดเวลา',
          409,
        );
        await findOrFail(
          models.bk_files,
          { _id: input.slip_file_id, access_level: 'private' },
          session,
        );
        const [payment] = await models.bk_payment_submissions.create(
          [{ ...input, booking_id: booking._id }],
          { session },
        );
        booking.status = 'payment_review';
        booking.hold_expires_at = null;
        await booking.save({ session });
        return payment;
      },
    ),
  );
});
router.post(
  '/events/:id/bookings/:bookingId/payments/:paymentId/review',
  async (req, res) => {
    objectId.parse(req.params.bookingId);
    objectId.parse(req.params.paymentId);
    const input = z
      .object({
        decision: z.enum(['approved', 'rejected']),
        note: text(2000).default(''),
      })
      .strict()
      .parse(req.body);
    await withEvent(
      req.params.id,
      req.bkUser,
      'review_payment',
      async (event, session) => {
        const booking = await findOrFail(
          models.bk_bookings,
          { _id: req.params.bookingId, event_id: event._id },
          session,
        );
        const payment = await findOrFail(
          models.bk_payment_submissions,
          { _id: req.params.paymentId, booking_id: booking._id },
          session,
        );
        requireValue(
          booking.status === 'payment_review' && payment.status === 'pending',
          'รายการนี้ถูกตรวจสอบไปแล้วหรือไม่อยู่ในสถานะรอตรวจ',
          409,
        );
        if (input.decision === 'approved') {
          requireValue(
            payment.submitted_amount_satang === booking.total_amount_satang,
            'ยอดชำระไม่ตรงกับยอดจอง',
          );
          booking.status = 'confirmed';
          booking.confirmed_at = new Date();
          booking.hold_expires_at = null;
        } else {
          requireValue(input.note, 'กรุณาระบุเหตุผลที่ไม่ผ่าน');
          booking.status = 'pending_payment';
          booking.payment_due_at = new Date(
            Date.now() + event.payment_due_minutes * 60000,
          );
          booking.hold_expires_at = booking.payment_due_at;
        }
        payment.status = input.decision;
        payment.review_note = input.note;
        payment.reviewed_by = req.bkUser._id;
        payment.reviewed_at = new Date();
        await payment.save({ session });
        await booking.save({ session });
        if (input.decision === 'approved')
          await models.bk_waitlist_entries.updateMany(
            { offered_booking_id: booking._id, status: 'offered' },
            { $set: { status: 'converted' } },
            { session },
          );
        else
          await models.bk_waitlist_entries.updateMany(
            { offered_booking_id: booking._id, status: 'offered' },
            { $set: { offer_expires_at: booking.payment_due_at } },
            { session },
          );
        await audit(req.bkUser, 'review_payment', payment, event._id, session, {
          decision: input.decision,
          note: input.note,
        });
      },
    );
    res.json({ ok: true });
  },
);
router.post('/events/:id/bookings/:bookingId/check-ins', async (req, res) => {
  objectId.parse(req.params.bookingId);
  const input = z
    .object({ guest_count: integer(1), note: text(2000).optional() })
    .strict()
    .parse(req.body);
  res.status(201).json(
    await withEvent(
      req.params.id,
      req.bkUser,
      'check_in',
      async (event, session) => {
        const booking = await findOrFail(
          models.bk_bookings,
          { _id: req.params.bookingId, event_id: event._id },
          session,
        );
        requireValue(
          booking.status === 'confirmed',
          'เช็กอินได้เฉพาะรายการที่ยืนยันแล้ว',
          409,
        );
        const existing = await models.bk_check_ins
          .find({ booking_id: booking._id })
          .session(session);
        requireValue(
          existing.reduce((sum, row) => sum + row.guest_count, 0) +
            input.guest_count <=
            booking.attendee_count,
          'จำนวนเช็กอินเกินจำนวนผู้ร่วมงาน',
        );
        const [record] = await models.bk_check_ins.create(
          [
            {
              ...input,
              booking_id: booking._id,
              checked_in_by: req.bkUser._id,
            },
          ],
          { session },
        );
        await audit(req.bkUser, 'check_in', booking, event._id, session, {
          guest_count: input.guest_count,
        });
        return record;
      },
    ),
  );
});
const waitlistInput = z
  .object({
    contact_name: text(150).min(1),
    contact_phone: text(32).min(5),
    contact_x_account: text(100).optional(),
    table_type_id: objectId.optional(),
    quantity: integer(1).max(1000).optional(),
    attendee_count: integer(1),
    note: text(2000).optional(),
  })
  .strict();
router.get('/events/:id/waitlist', async (req, res) => {
  objectId.parse(req.params.id);
  res.json(
    await models.bk_waitlist_entries
      .find({ event_id: req.params.id })
      .sort({ created_at: 1 })
      .limit(500),
  );
});
router.post('/events/:id/waitlist', async (req, res) => {
  const input = waitlistInput.parse(req.body);
  res.status(201).json(
    await withEvent(
      req.params.id,
      req.bkUser,
      'create_waitlist',
      async (event, session) => {
        requireValue(event.waitlist_enabled, 'งานนี้ยังไม่เปิดรับรายชื่อสำรอง');
        requireValue(
          !['archived', 'cancelled'].includes(event.status),
          'งานนี้ปิดแล้ว',
        );
        if (event.booking_mode === 'capacity') {
          requireValue(!input.table_type_id && input.quantity === undefined, 'งานนี้ไม่ใช้โต๊ะ');
          requireValue(input.attendee_count <= event.max_attendees_per_booking, 'จำนวนที่นั่งเกินกำหนดต่อการจอง');
        } else {
          requireValue(input.table_type_id && input.quantity, 'กรุณาเลือกประเภทและจำนวนโต๊ะ');
          const type = await findOrFail(
            models.bk_event_table_types,
            { _id: input.table_type_id, event_id: event._id },
            session,
          );
          requireValue(
            input.attendee_count <= type.capacity * input.quantity,
            'จำนวนผู้ร่วมงานเกินความจุ',
          );
        }
        const [entry] = await models.bk_waitlist_entries.create(
          [{ ...input, event_id: event._id, booking_mode: event.booking_mode || 'table' }],
          { session },
        );
        return entry;
      },
    ),
  );
});
router.patch('/events/:id/waitlist/:entryId', async (req, res) => {
  objectId.parse(req.params.entryId);
  const input = z
    .object({
      status: z.enum(['contacted', 'declined', 'cancelled']),
      note: text(2000).optional(),
    })
    .strict()
    .parse(req.body);
  res.json(
    await withEvent(
      req.params.id,
      req.bkUser,
      'update_waitlist',
      async (event, session) => {
        const entry = await findOrFail(
          models.bk_waitlist_entries,
          { _id: req.params.entryId, event_id: event._id },
          session,
        );
        requireValue(
          ['waiting', 'contacted'].includes(entry.status),
          'รายการนี้มีการเสนอสิทธิ์หรือปิดไปแล้ว',
          409,
        );
        entry.set(input);
        entry.contacted_by = req.bkUser._id;
        entry.contacted_at = new Date();
        await entry.save({ session });
        return entry;
      },
    ),
  );
});
router.post('/events/:id/waitlist/:entryId/offer', async (req, res) => {
  objectId.parse(req.params.entryId);
  const input = z
    .object({ request_key: z.string().uuid() })
    .strict()
    .parse(req.body);
  res.json(
    await withEvent(
      req.params.id,
      req.bkUser,
      'offer_waitlist',
      async (event, session) => {
        const entry = await findOrFail(
          models.bk_waitlist_entries,
          { _id: req.params.entryId, event_id: event._id },
          session,
        );
        requireValue(
          ['waiting', 'contacted'].includes(entry.status),
          'รายการนี้ถูกเสนอสิทธิ์ไปแล้ว',
          409,
        );
        const booking = await createBooking(
          event,
          {
            request_key: input.request_key,
            contact_name: entry.contact_name,
            contact_phone: entry.contact_phone,
            contact_x_account: entry.contact_x_account,
            attendee_count: entry.attendee_count,
            items: event.booking_mode === 'capacity' ? [] : [
              {
                table_type_id: String(entry.table_type_id),
                quantity: entry.quantity,
              },
            ],
          },
          req.bkUser,
          session,
        );
        entry.status = booking.status === 'confirmed' ? 'converted' : 'offered';
        entry.offered_booking_id = booking._id;
        entry.offer_expires_at = booking.payment_due_at;
        entry.contacted_by = req.bkUser._id;
        entry.contacted_at = new Date();
        await entry.save({ session });
        return booking;
      },
    ),
  );
});
module.exports = router;
