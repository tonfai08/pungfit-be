const { mongoose, bk_options, bk_ref, bk_integer, bk_text, bk_enum, bk_model } = require('./bk_shared');

const bk_payment_submissionsSchema = new mongoose.Schema({
  booking_id: bk_ref('bk_bookings', true),
  slip_file_id: bk_ref('bk_files', true),
  submitted_amount_satang: bk_integer(1, { required: true }),
  transferred_at: { type: Date, required: true },
  transaction_reference: bk_text(false, 150),
  status: bk_enum(['pending', 'approved', 'rejected'], 'pending'),
  review_note: bk_text(false, 2000),
  submitted_at: { type: Date, default: Date.now, required: true },
  reviewed_by: bk_ref('bk_users'),
  reviewed_at: Date,
}, bk_options);
bk_payment_submissionsSchema.index({ booking_id: 1, submitted_at: -1 });
bk_payment_submissionsSchema.index({ status: 1, submitted_at: 1 });
// Version one accepts one full payment; rejected attempts remain in the history.
bk_payment_submissionsSchema.index({ booking_id: 1 }, {
  unique: true,
  partialFilterExpression: { status: 'approved' },
  name: 'bk_one_approved_payment_per_booking',
});
bk_payment_submissionsSchema.pre('validate', function () {
  if (this.status !== 'pending') {
    if (!this.reviewed_by) this.invalidate('reviewed_by', 'A payment decision requires a reviewer');
    if (!this.reviewed_at) this.invalidate('reviewed_at', 'A payment decision requires a review timestamp');
  }
  if (this.status === 'rejected' && !this.review_note) {
    this.invalidate('review_note', 'Rejected evidence requires a reason');
  }
});

module.exports = bk_model('bk_payment_submissions', bk_payment_submissionsSchema);
