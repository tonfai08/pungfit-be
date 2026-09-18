const { mongoose, bk_options, bk_ref, bk_model, bk_objectFields } = require('./bk_shared');

const bk_event_layout_objectsSchema = new mongoose.Schema({
  event_layout_id: bk_ref('bk_event_layouts', true),
  ...bk_objectFields('bk_event_layout_objects'),
}, bk_options);
bk_event_layout_objectsSchema.index({ event_layout_id: 1, z_index: 1 });

module.exports = bk_model('bk_event_layout_objects', bk_event_layout_objectsSchema);
