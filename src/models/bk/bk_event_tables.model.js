const { mongoose, bk_options, bk_ref, bk_text, bk_model } = require('./bk_shared');

const bk_event_tablesSchema = new mongoose.Schema({
  event_id: bk_ref('bk_events', true),
  layout_object_id: bk_ref('bk_event_layout_objects', true),
  table_type_id: bk_ref('bk_event_table_types', true),
  code: { ...bk_text(true, 50), uppercase: true },
  zone: bk_text(false, 100),
  is_bookable: { type: Boolean, default: true },
  blocked_reason: bk_text(false, 1000),
}, bk_options);
bk_event_tablesSchema.index({ event_id: 1, code: 1 }, { unique: true });
bk_event_tablesSchema.index({ layout_object_id: 1 }, { unique: true });
bk_event_tablesSchema.index({ event_id: 1, table_type_id: 1, is_bookable: 1 });

module.exports = bk_model('bk_event_tables', bk_event_tablesSchema);
