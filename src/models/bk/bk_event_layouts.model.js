const { mongoose, bk_options, bk_ref, bk_integer, bk_model } = require('./bk_shared');

const bk_event_layoutsSchema = new mongoose.Schema({
  event_id: bk_ref('bk_events', true),
  source_template_id: bk_ref('bk_layout_templates'),
  canvas_width: bk_integer(1, { required: true }),
  canvas_height: bk_integer(1, { required: true }),
  background_file_id: bk_ref('bk_files'),
}, { ...bk_options, versionKey: 'version' });
bk_event_layoutsSchema.index({ event_id: 1 }, { unique: true });

module.exports = bk_model('bk_event_layouts', bk_event_layoutsSchema);
