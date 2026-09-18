const mongoose = require('mongoose');
const { z } = require('zod');
const models = require('../models/bk');

class BkError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function requireValue(condition, message, status = 400) {
  if (!condition) throw new BkError(status, message);
}
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID ไม่ถูกต้อง');
const text = (max = 255) => z.string().trim().max(max);
const integer = (min = 0) =>
  z.number().int().min(min).max(Number.MAX_SAFE_INTEGER);
const date = z.string().datetime({ offset: true });
function publicUser(user) {
  return {
    _id: user._id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    is_active: user.is_active,
    phone: user.phone,
    x_account: user.x_account,
    created_at: user.created_at,
  };
}
async function audit(actor, action, entity, eventId, session, changes = {}) {
  await models.bk_audit_logs.create(
    [
      {
        actor_id: actor?._id || null,
        action,
        entity_type: entity.constructor.modelName,
        entity_id: entity._id,
        event_id: eventId || null,
        changes_json: changes,
      },
    ],
    { session },
  );
}
async function expireBookings(eventId, session) {
  const expired = await models.bk_bookings
    .find({
      event_id: eventId,
      status: 'pending_payment',
      hold_expires_at: { $lte: new Date() },
    })
    .session(session);
  for (const booking of expired) {
    booking.status = 'expired';
    await booking.save({ session });
    await models.bk_waitlist_entries.updateMany(
      { offered_booking_id: booking._id, status: 'offered' },
      { $set: { status: 'expired' } },
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
      { $set: { released_at: new Date(), release_reason: 'หมดเวลาชำระเงิน' } },
      { session },
    );
    await audit(null, 'expire_booking', booking, eventId, session);
  }
}
async function withEvent(eventId, actor, action, work) {
  objectId.parse(eventId);
  return mongoose.connection.transaction(async (session) => {
    // Every inventory mutation writes this common event document first. Concurrent
    // transactions conflict and retry before counting inventory, avoiding write skew.
    const event = await models.bk_events.findOneAndUpdate(
      { _id: eventId },
      { $inc: { inventory_revision: 1 } },
      { new: true, session },
    );
    requireValue(event, 'ไม่พบงาน', 404);
    await expireBookings(eventId, session);
    const result = await work(event, session);
    await audit(actor, action, event, eventId, session);
    return result;
  });
}
async function findOrFail(Model, filter, session) {
  const result = await Model.findOne(filter).session(session || null);
  requireValue(result, 'ไม่พบข้อมูล', 404);
  return result;
}
module.exports = {
  BkError,
  requireValue,
  objectId,
  text,
  integer,
  date,
  publicUser,
  audit,
  expireBookings,
  withEvent,
  findOrFail,
  models,
  z,
  mongoose,
};
