const { mongoose, bk_options, bk_ref, bk_integer, bk_text, bk_enum, bk_model } = require('./bk_shared');

const bk_waitlist_entriesSchema = new mongoose.Schema({
  event_id: bk_ref('bk_events', true),
  user_id: bk_ref('bk_users'),
  contact_name: bk_text(true, 150),
  contact_phone: bk_text(true, 32),
  contact_x_account: bk_text(false, 100),
  table_type_id: bk_ref('bk_event_table_types', true),
  quantity: bk_integer(1, { required: true }),
  attendee_count: bk_integer(1, { required: true }),
  status: bk_enum(['waiting', 'contacted', 'offered', 'converted', 'declined', 'expired', 'cancelled'], 'waiting'),
  note: bk_text(false, 2000),
  contacted_by: bk_ref('bk_users'),
  contacted_at: Date,
  offer_expires_at: Date,
  offered_booking_id: bk_ref('bk_bookings'),
}, bk_options);
bk_waitlist_entriesSchema.index({ event_id: 1, status: 1, table_type_id: 1, created_at: 1 });
bk_waitlist_entriesSchema.index({ offered_booking_id: 1 }, {
  unique: true, partialFilterExpression: { offered_booking_id: { $type: 'objectId' } },
});
bk_waitlist_entriesSchema.pre('validate', function () {
  if (['offered', 'converted'].includes(this.status) && !this.offered_booking_id) {
    this.invalidate('offered_booking_id', 'An offer must reference a booking that reserves inventory');
  }
  if (this.status === 'offered' && !this.offer_expires_at) {
    this.invalidate('offer_expires_at', 'An offer requires an expiry deadline');
  }
});

module.exports = bk_model('bk_waitlist_entries', bk_waitlist_entriesSchema);
