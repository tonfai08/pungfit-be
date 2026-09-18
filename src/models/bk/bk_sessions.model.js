const { mongoose, bk_options, bk_ref, bk_integer, bk_model } = require('./bk_shared');
const bk_sessionsSchema = new mongoose.Schema({
  token_hash: { type: String, required: true },
  csrf_token: { type: String, required: true },
  user_id: bk_ref('bk_users', true),
  auth_version: bk_integer(0, { required: true }),
  expires_at: { type: Date, required: true },
}, bk_options);
bk_sessionsSchema.index({ token_hash: 1 }, { unique: true });
bk_sessionsSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
bk_sessionsSchema.index({ user_id: 1 });
module.exports = bk_model('bk_sessions', bk_sessionsSchema);
