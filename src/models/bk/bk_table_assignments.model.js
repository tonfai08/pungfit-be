const { mongoose, bk_options, bk_ref, bk_text, bk_model } = require('./bk_shared');

const bk_table_assignmentsSchema = new mongoose.Schema({
  booking_item_id: bk_ref('bk_booking_items', true),
  event_table_id: bk_ref('bk_event_tables', true),
  assigned_by: bk_ref('bk_users'),
  assigned_at: { type: Date, default: Date.now, required: true },
  released_at: { type: Date, default: null },
  release_reason: bk_text(false, 2000),
}, bk_options);
bk_table_assignmentsSchema.index({ event_table_id: 1 }, {
  unique: true,
  partialFilterExpression: { released_at: null },
  name: 'bk_one_active_assignment_per_table',
});
bk_table_assignmentsSchema.index({ booking_item_id: 1, released_at: 1 });
bk_table_assignmentsSchema.pre('validate', function () {
  if (this.released_at && this.released_at < this.assigned_at) {
    this.invalidate('released_at', 'Release cannot precede assignment');
  }
});

module.exports = bk_model('bk_table_assignments', bk_table_assignmentsSchema);
