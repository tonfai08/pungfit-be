const { randomUUID } = require('node:crypto');
const { mongoose, bk_options, bk_ref, bk_integer, bk_text, bk_enum, bk_model } = require('./bk_shared');

const bk_bookingsSchema = new mongoose.Schema({
  booking_no: { ...bk_text(true, 50), default: () => `BK-${randomUUID()}` },
  event_id: bk_ref('bk_events', true),
  request_key: { type: String, trim: true },
  user_id: bk_ref('bk_users'),
  booking_mode: bk_enum(['table', 'capacity'], 'table'),
  unit_price_per_attendee_satang: bk_integer(0),
  contact_name: bk_text(true, 150),
  contact_phone: bk_text(true, 32),
  contact_x_account: bk_text(false, 100),
  status: bk_enum(['pending_payment', 'payment_review', 'confirmed', 'expired', 'cancelled'], 'pending_payment'),
  attendee_count: bk_integer(1, { required: true }),
  total_amount_satang: bk_integer(0, { required: true }),
  currency: { type: String, enum: ['THB'], default: 'THB', required: true },
  payment_due_at: { type: Date, required: true },
  hold_expires_at: { type: Date, default: null },
  confirmed_at: Date,
  cancelled_at: Date,
  cancellation_reason: bk_text(false, 2000),
  source: bk_enum(['website', 'admin'], 'website'),
  customer_note: bk_text(false, 2000),
  internal_note: bk_text(false, 5000),
  created_by: bk_ref('bk_users'),
}, bk_options);
bk_bookingsSchema.index({ booking_no: 1 }, { unique: true });
bk_bookingsSchema.index({ event_id: 1, request_key: 1 }, { unique: true, partialFilterExpression: { request_key: { $type: 'string' } } });
bk_bookingsSchema.index({ event_id: 1, status: 1, created_at: -1 });
bk_bookingsSchema.index({ status: 1, hold_expires_at: 1 });
bk_bookingsSchema.index({ user_id: 1, created_at: -1 });
bk_bookingsSchema.index({ event_id: 1, contact_phone: 1 });
bk_bookingsSchema.pre('validate', function () {
  if (this.status === 'pending_payment' && !this.hold_expires_at) {
    this.invalidate('hold_expires_at', 'Pending payment requires an inventory hold deadline');
  }
  if (this.status === 'confirmed' && !this.confirmed_at) {
    this.invalidate('confirmed_at', 'Confirmed bookings require a confirmation timestamp');
  }
  if (this.status === 'cancelled' && !this.cancelled_at) {
    this.invalidate('cancelled_at', 'Cancelled bookings require a cancellation timestamp');
  }
});

module.exports = bk_model('bk_bookings', bk_bookingsSchema);
