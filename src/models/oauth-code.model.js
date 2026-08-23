const mongoose = require('mongoose');

const OAuthCodeSchema = new mongoose.Schema({
  code_hash: { type: String, unique: true, required: true, index: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  client_id: { type: String, required: true },
  redirect_uri: { type: String, required: true },
  code_challenge: { type: String, required: true },
  resource: { type: String, required: true },
  scope: { type: String, required: true },
  expires_at: { type: Date, required: true, expires: 0 },
}, { timestamps: true });

module.exports = mongoose.model('OAuthCode', OAuthCodeSchema);
