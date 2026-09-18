const { mongoose, bk_options, bk_ref, bk_integer, bk_text, bk_enum, bk_model, bk_orderedDates } = require('./bk_shared');

const bk_eventsSchema = new mongoose.Schema({
  name: bk_text(true),
  slug: { ...bk_text(true, 120), lowercase: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  short_description: bk_text(false, 1000),
  content_json: { type: mongoose.Schema.Types.Mixed, default: null },
  cover_file_id: bk_ref('bk_files'),
  poster_file_id: bk_ref('bk_files'),
  venue_name: bk_text(),
  venue_address: bk_text(false, 2000),
  map_url: bk_text(false, 2048),
  starts_at: Date,
  ends_at: Date,
  publish_at: Date,
  booking_opens_at: Date,
  booking_closes_at: Date,
  hide_at: Date,
  timezone: {
    type: String,
    default: 'Asia/Bangkok',
    required: true,
    validate: {
      validator(value) {
        try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
      },
      message: 'timezone must be a valid IANA time zone',
    },
  },
  status: bk_enum(['draft', 'scheduled', 'cancelled', 'archived'], 'draft'),
  table_selection_mode: bk_enum(['customer_select', 'admin_assign'], 'admin_assign'),
  waitlist_enabled: { type: Boolean, default: false },
  payment_due_minutes: bk_integer(1, { required: true, default: 30 }),
  payment_instructions: bk_text(false, 10000),
  booking_terms: bk_text(false, 20000),
  created_by: bk_ref('bk_users', true),
  inventory_revision: bk_integer(0, { default: 0 }),
}, bk_options);

bk_eventsSchema.index({ slug: 1 }, { unique: true });
bk_eventsSchema.index({ status: 1, publish_at: 1 });
bk_orderedDates(bk_eventsSchema, [
  ['starts_at', 'ends_at'], ['booking_opens_at', 'booking_closes_at'],
  ['publish_at', 'hide_at'], ['booking_closes_at', 'ends_at'],
]);
bk_eventsSchema.pre('validate', function () {
  if (this.status === 'scheduled') {
    for (const field of ['starts_at', 'ends_at', 'publish_at', 'booking_opens_at', 'booking_closes_at']) {
      if (!this[field]) this.invalidate(field, `${field} is required before scheduling`);
    }
    if (this.publish_at > this.booking_opens_at) this.invalidate('booking_opens_at', 'Booking cannot open before publication');
    if (this.hide_at && this.hide_at < this.booking_closes_at) this.invalidate('hide_at', 'Cannot hide an event before booking closes');
  }
});

module.exports = bk_model('bk_events', bk_eventsSchema);
