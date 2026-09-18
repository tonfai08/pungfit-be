const { mongoose, bk_options, bk_ref, bk_model, bk_objectFields } = require('./bk_shared');

const bk_template_objectsSchema = new mongoose.Schema({
  template_id: bk_ref('bk_layout_templates', true),
  ...bk_objectFields('bk_template_objects'),
}, bk_options);
bk_template_objectsSchema.index({ template_id: 1, z_index: 1 });

module.exports = bk_model('bk_template_objects', bk_template_objectsSchema);
