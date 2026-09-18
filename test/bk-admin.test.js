const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const sharp = require('sharp');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const models = require('../src/models/bk');
let database, server, base, uploads;
const password = 'Test-only-password-593!';
const oid = () => new mongoose.Types.ObjectId().toString();

test('event mode locks on creation and deletion hides events while retaining history', async () => {
  const staff = client();
  await ok(staff.call('/auth/login', 'POST', { email: 'super@example.test', password }));
  const event = await ok(staff.call('/events', 'POST', { name: 'Delete me', slug: 'delete-test' }), 201);
  const root = `/events/${event._id}`;
  assert.equal((await staff.call(root, 'PATCH', { booking_mode: 'capacity', capacity_limit: 10, max_attendees_per_booking: 2 })).status, 409);
  await ok(staff.call(root, 'PATCH', { name: 'Renamed', booking_mode: 'table' }));
  assert.equal((await client().call(root, 'DELETE')).status, 401);
  await ok(staff.call(root, 'DELETE'));
  assert.ok((await models.bk_events.findById(event._id)).deleted_at);
  assert.ok(await models.bk_audit_logs.exists({ action: 'delete_event', event_id: event._id }));
  assert.ok(!(await ok(staff.call('/events'))).some((row) => row._id === event._id));
  for (const path of ['', '/inventory', '/layout', '/bookings', '/waitlist'])
    assert.equal((await staff.call(root + path)).status, 404);
  assert.equal((await staff.call(root, 'PATCH', { name: 'Restore' })).status, 404);
  assert.equal((await staff.call(root, 'DELETE')).status, 404);
  const capacityEvent = await ok(staff.call('/events', 'POST', { name: 'History', slug: 'delete-history',
    booking_mode: 'capacity', capacity_limit: 2, max_attendees_per_booking: 2, payment_required: false, waitlist_enabled: true }), 201);
  const capacityRoot = `/events/${capacityEvent._id}`;
  assert.equal((await staff.call(capacityRoot, 'PATCH', { booking_mode: 'table' })).status, 409);
  const booking = await ok(staff.call(capacityRoot + '/bookings', 'POST', { request_key: crypto.randomUUID(),
    contact_name: 'Guest', contact_phone: '0812345678', attendee_count: 2 }), 201);
  assert.equal((await staff.call(capacityRoot, 'DELETE')).status, 409);
  await ok(staff.call(capacityRoot + '/bookings/' + booking._id + '/cancel', 'POST', { reason: 'Cancel' }));
  const waiting = await ok(staff.call(capacityRoot + '/waitlist', 'POST', { contact_name: 'Wait', contact_phone: '0812345678', attendee_count: 1 }), 201);
  assert.equal((await staff.call(capacityRoot, 'DELETE')).status, 409);
  await ok(staff.call(capacityRoot + '/waitlist/' + waiting._id, 'PATCH', { status: 'cancelled' }));
  await ok(staff.call(capacityRoot, 'DELETE'));
  assert.equal((await models.bk_bookings.findById(booking._id)).status, 'cancelled');
});

test('capacity mode serializes seat reservations, prices, expiry, waitlist and check-in without tables', async () => {
  const staff = client();
  await ok(staff.call('/auth/login', 'POST', { email: 'super@example.test', password }));
  assert.equal((await staff.call('/events', 'POST', { name: 'Invalid', slug: 'invalid-capacity', booking_mode: 'capacity' })).status, 400);
  const event = await ok(staff.call('/events', 'POST', {
    name: 'Capacity', slug: 'capacity-test', booking_mode: 'capacity', capacity_limit: 5,
    max_attendees_per_booking: 3, price_per_attendee_satang: 12500, waitlist_enabled: true,
  }), 201);
  const root = `/events/${event._id}`;
  const contact = { contact_name: 'Seat guest', contact_phone: '0812345678', attendee_count: 3 };
  assert.equal((await staff.call(root + '/bookings', 'POST', { ...contact, attendee_count: 4, request_key: crypto.randomUUID() })).status, 400);
  assert.equal((await staff.call(root + '/bookings', 'POST', { ...contact, items: [{ table_type_id: oid(), quantity: 1 }], request_key: crypto.randomUUID() })).status, 400);
  const requestKey = crypto.randomUUID();
  const results = await Promise.all([
    staff.call(root + '/bookings', 'POST', { ...contact, request_key: requestKey }),
    staff.call(root + '/bookings', 'POST', { ...contact, request_key: crypto.randomUUID() }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const booking = results.find((r) => r.status === 201).data;
  assert.equal(booking.total_amount_satang, 37500);
  assert.equal(booking.unit_price_per_attendee_satang, 12500);
  assert.equal(booking.status, 'pending_payment');
  assert.equal((await ok(staff.call(root + '/bookings/' + booking._id))).items.length, 0);
  const retry = await ok(staff.call(root + '/bookings', 'POST', { ...contact, request_key: booking.request_key }), 201);
  assert.equal(retry._id, booking._id);
  assert.equal((await ok(staff.call(root + '/inventory'))).capacity.available, 2);
  assert.equal((await staff.call(root, 'PATCH', { capacity_limit: 2, max_attendees_per_booking: 2 })).status, 409);
  assert.equal((await staff.call(root, 'PATCH', { booking_mode: 'table' })).status, 409);
  const waiting = await ok(staff.call(root + '/waitlist', 'POST', contact), 201);
  assert.equal(waiting.booking_mode, 'capacity');
  assert.equal((await staff.call(root + '/waitlist/' + waiting._id + '/offer', 'POST', { request_key: crypto.randomUUID() })).status, 409);
  await models.bk_bookings.updateOne({ _id: booking._id }, { hold_expires_at: new Date(0) });
  assert.equal((await ok(staff.call(root + '/inventory'))).capacity.available, 5);
  await ok(staff.call(root, 'PATCH', { payment_required: false }));
  const offered = await ok(staff.call(root + '/waitlist/' + waiting._id + '/offer', 'POST', { request_key: crypto.randomUUID() }));
  assert.equal(offered.status, 'confirmed');
  assert.equal(offered.total_amount_satang, 0);
  assert.equal((await ok(staff.call(root + '/bookings/' + booking._id))).booking.total_amount_satang, 37500);
  assert.equal((await ok(staff.call(root + '/inventory'))).capacity.reserved, 3);
  await ok(staff.call(root + '/bookings/' + offered._id + '/cancel', 'POST', { reason: 'Release quota' }));
  assert.equal((await ok(staff.call(root + '/inventory'))).capacity.available, 5);
  const admitted = await ok(staff.call(root + '/bookings', 'POST', { ...contact, request_key: crypto.randomUUID() }), 201);
  await ok(staff.call(root + '/bookings/' + admitted._id + '/check-ins', 'POST', { guest_count: 2 }), 201);
  assert.equal((await staff.call(root + '/bookings/' + admitted._id + '/check-ins', 'POST', { guest_count: 2 })).status, 400);
});

test('free events, registered customers, color persistence and atomic map booking', async () => {
  const staff = client();
  await ok(staff.call('/auth/login', 'POST', { email: 'super@example.test', password }));
  const event = await ok(staff.call('/events', 'POST', {
    name: 'Free map', slug: 'free-map', payment_required: false,
  }), 201);
  const root = `/events/${event._id}`;
  const template = await ok(staff.call('/templates', 'POST', {
    name: 'Colors', canvas_width: 1000, canvas_height: 700, version: 0,
    objects: [{ _id: oid(), kind: 'table', label: 'F01', x: 100, y: 100, width: 80, height: 80,
      properties_json: { shape: 'round', capacity: 4, color: '#E6DAF5' } }],
  }));
  const layout = await ok(staff.call(root + '/copy-template', 'POST', { template_id: template._id }));
  assert.equal(layout.objects[0].properties_json.color, '#E6DAF5');
  assert.equal((await ok(staff.call(root + '/layout'))).objects[0].properties_json.color, '#E6DAF5');
  let stock = await ok(staff.call(root + '/inventory'));
  const type = stock.types[0], table = stock.tables[0];
  await ok(staff.call(root + '/table-types/' + type._id, 'PATCH', { price_satang: 99000 }));
  assert.equal((await ok(staff.call(root + '/inventory'))).types[0].price_satang, 0);
  const customer = await ok(staff.call('/customers', 'POST', {
    display_name: 'Registered', phone: '0812345678', x_account: '@registered',
  }), 201);
  const input = { user_id: customer._id, contact_name: 'Ignored snapshot', contact_phone: '00000',
    attendee_count: 2, items: [{ table_type_id: type._id, quantity: 1, table_ids: [table._id] }] };
  const requests = await Promise.all([1, 2].map(() => staff.call(root + '/bookings', 'POST', {
    ...input, request_key: crypto.randomUUID(),
  })));
  assert.deepEqual(requests.map((r) => r.status).sort(), [201, 409]);
  const booking = requests.find((r) => r.status === 201).data;
  assert.equal(booking.total_amount_satang, 0);
  assert.equal(booking.status, 'confirmed');
  assert.equal(booking.hold_expires_at, null);
  assert.equal(booking.user_id, customer._id);
  assert.equal(booking.contact_name, 'Registered');
  stock = await ok(staff.call(root + '/inventory'));
  assert.equal(stock.assignments[0].booking.contact_x_account, '@registered');
  assert.equal(stock.assignments[0].booking.user_id, customer._id);
  await ok(staff.call(root, 'PATCH', { payment_required: true }));
  assert.equal((await ok(staff.call(root + '/bookings/' + booking._id))).booking.total_amount_satang, 0);
  await ok(staff.call(root + '/bookings/' + booking._id + '/cancel', 'POST', { reason: 'Test release' }));
  const paid = await ok(staff.call(root + '/bookings', 'POST', { ...input, request_key: crypto.randomUUID() }), 201);
  assert.equal(paid.total_amount_satang, 99000);
  assert.equal(paid.status, 'pending_payment');
  await models.bk_bookings.updateOne({ _id: paid._id }, { hold_expires_at: new Date(0) });
  assert.equal((await ok(staff.call(root + '/inventory'))).assignments.length, 0);
});
function client() {
  let cookie = '',
    csrf = '';
  return {
    get cookie() {
      return cookie;
    },
    async call(url, method = 'GET', body, overrides = {}) {
      const response = await fetch(base + url, {
        method,
        headers: {
          Origin: 'http://localhost:3000',
          ...(cookie ? { Cookie: cookie } : {}),
          ...(csrf ? { 'X-Bk-Csrf': csrf } : {}),
          ...(body && !(body instanceof FormData)
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...overrides,
        },
        body:
          body instanceof FormData
            ? body
            : body
              ? JSON.stringify(body)
              : undefined,
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const data = response.headers.get('content-type')?.includes('json')
        ? await response.json()
        : await response.arrayBuffer();
      if (data.csrf) csrf = data.csrf;
      return { status: response.status, data, headers: response.headers };
    },
  };
}
async function ok(result, expected = 200) {
  const response = await result;
  assert.equal(response.status, expected, JSON.stringify(response.data));
  return response.data;
}
before(
  async () => {
    process.env.BK_ALLOWED_ORIGINS = 'http://localhost:3000';
    uploads = await fs.mkdtemp(path.join(os.tmpdir(), 'bk-admin-test-'));
    process.env.BK_UPLOAD_DIR = uploads;
    database = await MongoMemoryReplSet.create({
      binary: {
        version: '7.0.24',
        downloadDir: path.resolve('.cache/mongodb'),
      },
      replSet: { count: 1 },
    });
    await mongoose.connect(database.getUri(), { dbName: 'bk_admin_test' });
    await Promise.all(Object.values(models).map((Model) => Model.init()));
    await models.bk_users.create({
      email: 'super@example.test',
      display_name: 'Super',
      password_hash: await bcrypt.hash(password, 12),
      role: 'super_admin',
    });
    const app = express();
    app.use('/v1/bk', require('../src/routes/bk.routes'));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/v1/bk`;
  },
  { timeout: 180000 },
);
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (database) await database.stop();
  if (
    uploads &&
    path.basename(uploads).startsWith('bk-admin-test-') &&
    path.dirname(uploads) === os.tmpdir()
  )
    await fs.rm(uploads, { recursive: true, force: true });
});

test('admin lifecycle, layout copies, inventory concurrency, evidence, check-in and revocation', async (t) => {
  const superClient = client();
  const admin = client();
  const anonymous = client();
  let adminId, eventId, templateId, typeId, tableId, bookingId;
  await t.test(
    'login uses opaque HttpOnly sessions and rejects missing origin, authentication and CSRF',
    async () => {
      assert.equal((await anonymous.call('/events')).status, 401);
      assert.equal(
        (
          await anonymous.call(
            '/auth/login',
            'POST',
            { email: 'super@example.test', password },
            { Origin: 'https://evil.example' },
          )
        ).status,
        403,
      );
      const login = await superClient.call('/auth/login', 'POST', {
        email: 'super@example.test',
        password,
      });
      assert.equal(login.status, 200);
      assert.match(login.headers.get('set-cookie'), /HttpOnly/);
      assert.match(login.headers.get('set-cookie'), /SameSite=Lax/);
      const token = superClient.cookie.split('=')[1];
      assert.equal(
        await models.bk_sessions.countDocuments({ token_hash: token }),
        0,
      );
      assert.equal(
        await models.bk_sessions.countDocuments({
          token_hash: crypto.createHash('sha256').update(token).digest('hex'),
        }),
        1,
      );
      assert.equal(
        (
          await superClient.call(
            '/events',
            'POST',
            { name: 'bad', slug: 'bad' },
            { 'X-Bk-Csrf': '' },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await superClient.call(
            '/events',
            'POST',
            {},
            { 'X-Bk-Csrf': 'é'.repeat(64) },
          )
        ).status,
        403,
      );
    },
  );
  await t.test(
    'only super admin can create staff; privilege injection and deleting super are rejected',
    async () => {
      const created = await ok(
        superClient.call('/auth/admins', 'POST', {
          email: 'admin@example.test',
          display_name: 'Staff',
          password,
        }),
        201,
      );
      adminId = created._id;
      assert.equal(created.password_hash, undefined);
      await ok(
        admin.call('/auth/login', 'POST', {
          email: 'admin@example.test',
          password,
        }),
      );
      assert.equal((await admin.call('/auth/admins')).status, 403);
      assert.equal(
        (
          await admin.call('/auth/admins', 'POST', {
            email: 'evil@example.test',
            display_name: 'Bad',
            password,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await superClient.call('/auth/admins', 'POST', {
            email: 'evil@example.test',
            display_name: 'Bad',
            password,
            role: 'super_admin',
          })
        ).status,
        400,
      );
      const me = await ok(superClient.call('/auth/me'));
      assert.equal(
        (await superClient.call(`/auth/admins/${me.user._id}`, 'DELETE'))
          .status,
        404,
      );
    },
  );
  await t.test(
    'event content is sanitized and a template is copied with remapped chairs',
    async () => {
      const event = await ok(
        admin.call('/events', 'POST', {
          name: 'Test event',
          slug: 'test-event',
          waitlist_enabled: true,
          content_html:
            '<p>Safe</p><script>alert(1)</script><img src="https://evil.test/a" onerror="alert(1)"><a href="javascript:alert(1)">link</a>',
        }),
        201,
      );
      eventId = event._id;
      assert.doesNotMatch(
        event.content_json.html,
        /script|onerror|evil\.test|javascript/,
      );
      const table = {
        _id: oid(),
        kind: 'table',
        label: 'A01',
        x: 100,
        y: 100,
        width: 80,
        height: 80,
        properties_json: { shape: 'round', capacity: 4 },
      };
      const chair = {
        _id: oid(),
        kind: 'chair',
        label: 'Seat 1',
        x: 185,
        y: 120,
        width: 20,
        height: 20,
        parent_object_id: table._id,
      };
      const template = await ok(
        admin.call('/templates', 'POST', {
          name: 'Hall',
          canvas_width: 1000,
          canvas_height: 700,
          version: 0,
          objects: [table, chair],
        }),
      );
      templateId = template._id;
      const copied = await ok(
        admin.call(`/events/${eventId}/copy-template`, 'POST', {
          template_id: templateId,
        }),
      );
      const copiedTable = copied.objects.find(
        (object) => object.kind === 'table',
      );
      assert.notEqual(copiedTable._id, table._id);
      assert.equal(
        copied.objects.find((object) => object.kind === 'chair')
          .parent_object_id,
        copiedTable._id,
      );
      const saved = await ok(
        admin.call(`/templates/${templateId}`, 'PUT', {
          name: 'Changed',
          canvas_width: 1000,
          canvas_height: 700,
          version: template.version,
          objects: [{ ...table, x: 300 }, chair],
        }),
      );
      assert.equal(saved.objects[0].x, 300);
      const independent = await ok(admin.call(`/events/${eventId}/layout`));
      assert.equal(independent.objects.find((o) => o.kind === 'table').x, 100);
      const types = await ok(admin.call(`/events/${eventId}/table-types`));
      typeId = types[0]._id;
      await ok(
        admin.call(`/events/${eventId}/table-types/${typeId}`, 'PATCH', {
          price_satang: 200000,
        }),
      );
      tableId = (await ok(admin.call(`/events/${eventId}/inventory`))).tables[0]
        ._id;
    },
  );
  let winningInput;
  await t.test(
    'two simultaneous bookings for the last table cannot oversell; retry is idempotent',
    async () => {
      const makeInput = () => ({
        request_key: crypto.randomUUID(),
        contact_name: 'Guest',
        contact_phone: '0812345678',
        attendee_count: 4,
        items: [{ table_type_id: typeId, quantity: 1 }],
      });
      const inputs = [makeInput(), makeInput()];
      const results = await Promise.all(
        inputs.map((input) =>
          admin.call(`/events/${eventId}/bookings`, 'POST', input),
        ),
      );
      assert.deepEqual(
        results.map((result) => result.status).sort(),
        [201, 409],
      );
      const winner = results.findIndex((result) => result.status === 201);
      bookingId = results[winner].data._id;
      winningInput = inputs[winner];
      const retry = await ok(
        admin.call(`/events/${eventId}/bookings`, 'POST', winningInput),
        201,
      );
      assert.equal(retry._id, bookingId);
      assert.equal(
        await models.bk_bookings.countDocuments({ event_id: eventId }),
        1,
      );
      const inventory = await ok(admin.call(`/events/${eventId}/inventory`));
      assert.equal(inventory.types[0].available, 0);
    },
  );
  await t.test(
    'assignments require matching event/type; live inventory cannot be removed',
    async () => {
      const detail = await ok(
        admin.call(`/events/${eventId}/bookings/${bookingId}`),
      );
      await ok(
        admin.call(
          `/events/${eventId}/bookings/${bookingId}/assignments/${detail.items[0]._id}`,
          'PUT',
          { table_ids: [tableId] },
        ),
      );
      assert.equal(
        (
          await admin.call(
            `/events/${eventId}/bookings/${bookingId}/assignments/${detail.items[0]._id}`,
            'PUT',
            { table_ids: [tableId, tableId] },
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await admin.call(
            `/events/${eventId}/table-types/${typeId}`,
            'PATCH',
            { capacity: 2 },
          )
        ).status,
        409,
      );
      const layout = await ok(admin.call(`/events/${eventId}/layout`));
      assert.equal(
        (
          await admin.call(`/events/${eventId}/layout`, 'PUT', {
            canvas_width: 1000,
            canvas_height: 700,
            version: layout.version,
            objects: [],
          })
        ).status,
        409,
      );
    },
  );
  await t.test(
    'private image upload, payment review and concurrent check-in enforce actual limits',
    async () => {
      const image = await sharp({
        create: { width: 20, height: 20, channels: 3, background: '#ffffff' },
      })
        .png()
        .toBuffer();
      const form = new FormData();
      form.append(
        'image',
        new Blob([image], { type: 'image/png' }),
        'slip.png',
      );
      const file = await ok(admin.call('/files', 'POST', form), 201);
      assert.equal((await anonymous.call(`/files/${file._id}`)).status, 401);
      assert.equal((await admin.call(`/files/${file._id}`)).status, 200);
      const root = `/events/${eventId}/bookings/${bookingId}`;
      const wrong = await ok(
        admin.call(`${root}/payments`, 'POST', {
          slip_file_id: file._id,
          submitted_amount_satang: 1,
          transferred_at: new Date().toISOString(),
        }),
        201,
      );
      assert.equal(
        (
          await admin.call(`${root}/payments/${wrong._id}/review`, 'POST', {
            decision: 'approved',
          })
        ).status,
        400,
      );
      await ok(
        admin.call(`${root}/payments/${wrong._id}/review`, 'POST', {
          decision: 'rejected',
          note: 'Wrong amount',
        }),
      );
      const payment = await ok(
        admin.call(`${root}/payments`, 'POST', {
          slip_file_id: file._id,
          submitted_amount_satang: 200000,
          transferred_at: new Date().toISOString(),
        }),
        201,
      );
      await ok(
        admin.call(`${root}/payments/${payment._id}/review`, 'POST', {
          decision: 'approved',
        }),
      );
      assert.equal(
        (
          await admin.call(`${root}/payments/${payment._id}/review`, 'POST', {
            decision: 'approved',
          })
        ).status,
        409,
      );
      const results = await Promise.all([
        admin.call(`${root}/check-ins`, 'POST', { guest_count: 3 }),
        admin.call(`${root}/check-ins`, 'POST', { guest_count: 3 }),
      ]);
      assert.deepEqual(
        results.map((result) => result.status).sort(),
        [201, 400],
      );
      assert.equal(
        (
          await admin.call(`${root}/cancel`, 'POST', {
            reason: 'Cannot cancel after arrival',
          })
        ).status,
        409,
      );
    },
  );
  await t.test(
    'expired holds release assignments; waitlist offers reserve inventory and cancellation returns it',
    async () => {
      const event = await ok(
        admin.call('/events', 'POST', {
          name: 'Second',
          slug: 'second-event',
          waitlist_enabled: true,
        }),
        201,
      );
      await ok(
        admin.call(`/events/${event._id}/copy-template`, 'POST', {
          template_id: templateId,
        }),
      );
      const stock = await ok(admin.call(`/events/${event._id}/inventory`));
      const type = stock.types[0];
      await ok(
        admin.call(`/events/${event._id}/table-types/${type._id}`, 'PATCH', {
          price_satang: 10000,
        }),
      );
      const input = {
        request_key: crypto.randomUUID(),
        contact_name: 'Pending',
        contact_phone: '0811111111',
        attendee_count: 2,
        items: [
          {
            table_type_id: type._id,
            quantity: 1,
            table_ids: [stock.tables[0]._id],
          },
        ],
      };
      const first = await ok(
        admin.call(`/events/${event._id}/bookings`, 'POST', input),
        201,
      );
      await models.bk_bookings.updateOne(
        { _id: first._id },
        { $set: { hold_expires_at: new Date(Date.now() - 1000) } },
      );
      const second = await ok(
        admin.call(`/events/${event._id}/bookings`, 'POST', {
          ...input,
          request_key: crypto.randomUUID(),
        }),
        201,
      );
      assert.equal(
        (await models.bk_bookings.findById(first._id)).status,
        'expired',
      );
      assert.equal(
        await models.bk_table_assignments.countDocuments({
          event_table_id: stock.tables[0]._id,
          released_at: null,
        }),
        1,
      );
      const entry = await ok(
        admin.call(`/events/${event._id}/waitlist`, 'POST', {
          contact_name: 'Waiting',
          contact_phone: '0822222222',
          attendee_count: 2,
          table_type_id: type._id,
          quantity: 1,
        }),
        201,
      );
      assert.equal(
        (
          await admin.call(
            `/events/${event._id}/waitlist/${entry._id}/offer`,
            'POST',
            { request_key: crypto.randomUUID() },
          )
        ).status,
        409,
      );
      await ok(
        admin.call(
          `/events/${event._id}/bookings/${second._id}/cancel`,
          'POST',
          { reason: 'Changed plans' },
        ),
      );
      const offered = await ok(
        admin.call(`/events/${event._id}/waitlist/${entry._id}/offer`, 'POST', {
          request_key: crypto.randomUUID(),
        }),
      );
    assert.equal(offered.status, 'pending_payment');
    assert.equal(
      (await ok(admin.call(`/events/${event._id}/inventory`))).types[0]
        .available,
      0,
    );
    await models.bk_bookings.updateOne({ _id: offered._id }, { $set: { hold_expires_at: new Date(Date.now() - 1000) } });
    await require('../src/services/bk-maintenance').expireDueBookings();
    assert.equal((await models.bk_bookings.findById(offered._id)).status, 'expired');
    assert.equal((await models.bk_waitlist_entries.findById(entry._id)).status, 'expired');
    },
  );
  await t.test(
    'disable/delete revokes sessions, logout invalidates the cookie, audit avoids passwords',
    async () => {
      await ok(
        superClient.call(`/auth/admins/${adminId}`, 'PATCH', {
          is_active: false,
        }),
      );
      assert.equal((await admin.call('/events')).status, 401);
      await ok(
        superClient.call(`/auth/admins/${adminId}`, 'PATCH', {
          is_active: true,
        }),
      );
      await ok(
        admin.call('/auth/login', 'POST', {
          email: 'admin@example.test',
          password,
        }),
      );
      await ok(superClient.call(`/auth/admins/${adminId}`, 'DELETE'));
      assert.equal((await admin.call('/events')).status, 401);
      const logs = await ok(superClient.call('/audit'));
      assert.ok(logs.length > 0);
      assert.doesNotMatch(
        JSON.stringify(logs),
        /password_hash|Test-only-password/,
      );
      await ok(superClient.call('/auth/logout', 'POST'));
      assert.equal((await superClient.call('/events')).status, 401);
    },
  );
});
