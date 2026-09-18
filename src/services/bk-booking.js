const {
  models,
  z,
  objectId,
  text,
  integer,
  requireValue,
} = require('./bk-common');
const activeStatuses = ['pending_payment', 'payment_review', 'confirmed'];
const bookingInput = z
  .object({
    request_key: z.string().uuid(),
    user_id: objectId.optional(),
    contact_name: text(150).min(1),
    contact_phone: text(32).min(5),
    contact_x_account: text(100).optional(),
    attendee_count: integer(1),
    customer_note: text(2000).optional(),
    internal_note: text(5000).optional(),
    items: z
      .array(
        z
          .object({
            table_type_id: objectId,
            quantity: integer(1).max(1000),
            table_ids: z.array(objectId).max(1000).optional(),
          })
          .strict(),
      )
      .max(50).default([]),
  })
  .strict();
async function reservedQuantity(eventId, typeId, session) {
  const bookings = await models.bk_bookings
    .find({
      event_id: eventId,
      $or: [
        { status: { $in: ['payment_review', 'confirmed'] } },
        { status: 'pending_payment', hold_expires_at: { $gt: new Date() } },
      ],
    })
    .select('_id')
    .session(session || null);
  const items = await models.bk_booking_items
    .find({
      booking_id: { $in: bookings.map((booking) => booking._id) },
      table_type_id: typeId,
    })
    .session(session || null);
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
async function reservedAttendees(eventId, session) {
  const rows = await models.bk_bookings.find({ event_id: eventId, $or: [
    { status: { $in: ['confirmed', 'payment_review'] } },
    { status: 'pending_payment', hold_expires_at: { $gt: new Date() } },
  ] }).select('attendee_count').session(session || null).lean();
  return rows.reduce((sum, booking) => sum + booking.attendee_count, 0);
}
async function createBooking(event, input, actor, session) {
  const duplicate = await models.bk_bookings
    .findOne({ event_id: event._id, request_key: input.request_key })
    .session(session);
  if (duplicate) return duplicate;
  if (input.user_id) {
    const customer = await models.bk_users.findOne({
      _id: input.user_id, role: 'customer', is_active: true, deleted_at: null,
    }).session(session);
    requireValue(customer, 'ไม่พบผู้ลงทะเบียนที่ใช้งานได้');
    input = { ...input, contact_name: customer.display_name,
      contact_phone: customer.phone || '', contact_x_account: customer.x_account || '' };
    requireValue(input.contact_phone.length >= 5, 'กรุณาเพิ่มเบอร์โทรในรายชื่อผู้ติดต่อก่อนจอง');
  }
  requireValue(
    !['cancelled', 'archived'].includes(event.status),
    'งานนี้ยกเลิกหรือเก็บถาวรแล้ว',
    409,
  );
  requireValue(
    new Set(input.items.map((item) => item.table_type_id)).size ===
      input.items.length,
    'ประเภทโต๊ะซ้ำ',
  );
  let total = 0;
  let capacity = 0;
  const lines = [];
  const capacityMode = event.booking_mode === 'capacity';
  const unitPrice = event.payment_required === false ? 0 : event.price_per_attendee_satang || 0;
  if (capacityMode) {
    requireValue(!input.items.length, 'งานแบบจำกัดผู้ร่วมงานไม่ใช้โต๊ะ');
    requireValue(event.capacity_limit && event.max_attendees_per_booking, 'กรุณากำหนดโควตางานก่อนเปิดจอง');
    requireValue(input.attendee_count <= event.max_attendees_per_booking, 'จำนวนที่นั่งเกินกำหนดต่อการจอง');
    const available = event.capacity_limit - await reservedAttendees(event._id, session);
    requireValue(input.attendee_count <= available, `ที่นั่งไม่พอ เหลือ ${available} ที่นั่ง`, 409);
    capacity = input.attendee_count;
    total = unitPrice * input.attendee_count;
  } else requireValue(input.items.length > 0, 'กรุณาเลือกประเภทโต๊ะ');
  for (const item of input.items) {
    const type = await models.bk_event_table_types
      .findOne({
        _id: item.table_type_id,
        event_id: event._id,
        is_active: true,
      })
      .session(session);
    requireValue(type, 'ไม่พบประเภทโต๊ะที่เปิดขายในงานนี้');
    requireValue(
      !type.max_tables_per_booking ||
        item.quantity <= type.max_tables_per_booking,
      'จำนวนโต๊ะเกินกำหนดต่อการจอง',
    );
    const available =
      (await models.bk_event_tables
        .countDocuments({
          event_id: event._id,
          table_type_id: type._id,
          is_bookable: true,
        })
        .session(session)) -
      (await reservedQuantity(event._id, type._id, session));
    requireValue(
      available >= item.quantity,
      `${type.name}: โต๊ะไม่พอ เหลือ ${available} โต๊ะ`,
      409,
    );
    const price = event.payment_required === false ? 0 : type.price_satang;
    total += item.quantity * price;
    capacity += item.quantity * type.capacity;
    lines.push({
      ...item,
      unit_price_satang: price,
      capacity_per_table: type.capacity,
      line_total_satang: item.quantity * price,
    });
  }
  requireValue(Number.isSafeInteger(total), 'ยอดเงินเกินขอบเขตที่รองรับ');
  requireValue(
    input.attendee_count <= capacity,
    'จำนวนผู้ร่วมงานเกินจำนวนที่นั่ง',
  );
  const deadline = new Date(Date.now() + event.payment_due_minutes * 60000);
  const [booking] = await models.bk_bookings.create(
    [
      {
        event_id: event._id,
        user_id: input.user_id,
        booking_mode: capacityMode ? 'capacity' : 'table',
        unit_price_per_attendee_satang: capacityMode ? unitPrice : undefined,
        request_key: input.request_key,
        contact_name: input.contact_name,
        contact_phone: input.contact_phone,
        contact_x_account: input.contact_x_account,
        attendee_count: input.attendee_count,
        total_amount_satang: total,
        payment_due_at: deadline,
        hold_expires_at: total === 0 ? null : deadline,
        source: 'admin',
        created_by: actor._id,
        status: total === 0 ? 'confirmed' : 'pending_payment',
        confirmed_at: total === 0 ? new Date() : undefined,
        customer_note: input.customer_note,
        internal_note: input.internal_note,
      },
    ],
    { session },
  );
  for (const { table_ids, ...line } of lines) {
    const [item] = await models.bk_booking_items.create(
      [{ ...line, booking_id: booking._id }],
      { session },
    );
    if (table_ids?.length)
      await assignTables(event, booking, item, table_ids, actor, session);
  }
  return booking;
}
async function assignTables(event, booking, item, ids, actor, session) {
  requireValue(
    activeStatuses.includes(booking.status),
    'จัดโต๊ะได้เฉพาะการจองที่ยังมีผล',
    409,
  );
  requireValue(
    new Set(ids).size === ids.length && ids.length <= item.quantity,
    'จำนวนโต๊ะไม่ถูกต้องหรือมีโต๊ะซ้ำ',
  );
  for (const id of ids) {
    const table = await models.bk_event_tables
      .findOne({
        _id: id,
        event_id: event._id,
        table_type_id: item.table_type_id,
        is_bookable: true,
      })
      .session(session);
    requireValue(table, 'โต๊ะไม่ตรงประเภทหรือไม่เปิดให้จอง');
    requireValue(
      !(await models.bk_table_assignments
        .exists({
          event_table_id: id,
          released_at: null,
          booking_item_id: { $ne: item._id },
        })
        .session(session)),
      'โต๊ะถูกจัดให้รายการอื่นแล้ว',
      409,
    );
  }
  await models.bk_table_assignments.updateMany(
    { booking_item_id: item._id, released_at: null },
    { $set: { released_at: new Date(), release_reason: 'จัดโต๊ะใหม่' } },
    { session },
  );
  for (const id of ids)
    await models.bk_table_assignments.create(
      [
        {
          booking_item_id: item._id,
          event_table_id: id,
          assigned_by: actor._id,
        },
      ],
      { session },
    );
}
module.exports = {
  activeStatuses,
  bookingInput,
  reservedQuantity,
  reservedAttendees,
  createBooking,
  assignTables,
};
