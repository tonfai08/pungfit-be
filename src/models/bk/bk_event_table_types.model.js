const { mongoose, bk_options, bk_ref, bk_integer, bk_text, bk_model } = require('./bk_shared');

const bk_event_table_typesSchema = new mongoose.Schema({
  event_id: bk_ref('bk_events', true),
  name: bk_text(true, 100),
  capacity: bk_integer(1, { required: true }),
  price_satang: bk_integer(0, { required: true }),
  currency: { type: String, enum: ['THB'], default: 'THB', required: true },
  max_tables_per_booking: bk_integer(1),
  sort_order: bk_integer(0, { default: 0 }),
  is_active: { type: Boolean, default: true },
}, bk_options);
bk_event_table_typesSchema.index({ event_id: 1, name: 1 }, { unique: true });

module.exports = bk_model('bk_event_table_types', bk_event_table_typesSchema);
