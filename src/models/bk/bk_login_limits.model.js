const { mongoose, bk_model } = require('./bk_shared');
const bk_login_limitsSchema = new mongoose.Schema({
  _id: String,
  count: { type: Number, default: 0 },
  expires_at: { type: Date, required: true },
});
bk_login_limitsSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
module.exports = bk_model('bk_login_limits', bk_login_limitsSchema);
