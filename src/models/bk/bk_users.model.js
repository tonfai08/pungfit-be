const { mongoose, bk_options, bk_text, bk_enum, bk_model, bk_integer } = require('./bk_shared');

const bk_usersSchema = new mongoose.Schema({
  auth_uid: bk_text(false, 255),
  email: { ...bk_text(false, 254), lowercase: true },
  password_hash: { type: String, select: false },
  auth_version: bk_integer(0, { default: 0 }),
  deleted_at: { type: Date, default: null },
  display_name: bk_text(true, 150),
  phone: bk_text(false, 32),
  x_account: bk_text(false, 100),
  role: bk_enum(['customer', 'admin', 'super_admin'], 'customer'),
  is_active: { type: Boolean, default: true },
}, bk_options);
bk_usersSchema.index({ auth_uid: 1 }, { unique: true, partialFilterExpression: { auth_uid: { $type: 'string' } } });
bk_usersSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });

module.exports = bk_model('bk_users', bk_usersSchema);
