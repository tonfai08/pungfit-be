const { mongoose, bk_options, bk_ref, bk_integer, bk_text, bk_model } = require('./bk_shared');

const bk_check_insSchema = new mongoose.Schema({
  booking_id: bk_ref('bk_bookings', true),
  guest_count: bk_integer(1, { required: true }),
  checked_in_by: bk_ref('bk_users', true),
  checked_in_at: { type: Date, default: Date.now, required: true },
  note: bk_text(false, 2000),
}, bk_options);
bk_check_insSchema.index({ booking_id: 1, checked_in_at: 1 });

module.exports = bk_model('bk_check_ins', bk_check_insSchema);
