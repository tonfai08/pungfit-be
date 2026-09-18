const { mongoose, bk_options, bk_ref, bk_integer, bk_text, bk_model } = require('./bk_shared');

const bk_layout_templatesSchema = new mongoose.Schema({
  name: bk_text(true),
  description: bk_text(false, 2000),
  canvas_width: bk_integer(1, { required: true }),
  canvas_height: bk_integer(1, { required: true }),
  background_file_id: bk_ref('bk_files'),
  created_by: bk_ref('bk_users', true),
}, bk_options);

module.exports = bk_model('bk_layout_templates', bk_layout_templatesSchema);
