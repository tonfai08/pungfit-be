const { mongoose, bk_options, bk_ref, bk_integer, bk_text, bk_enum, bk_model } = require('./bk_shared');

const bk_filesSchema = new mongoose.Schema({
  storage_key: bk_text(true, 1024),
  original_name: bk_text(true),
  mime_type: bk_text(true, 100),
  size_bytes: bk_integer(1, { required: true }),
  access_level: bk_enum(['public', 'private'], 'private'),
  uploaded_by: bk_ref('bk_users'),
}, bk_options);
bk_filesSchema.index({ storage_key: 1 }, { unique: true });

module.exports = bk_model('bk_files', bk_filesSchema);
