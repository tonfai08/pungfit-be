const mongoose = require('mongoose');

const OAuthClientSchema = new mongoose.Schema({
  client_id: { type: String, unique: true, required: true, index: true },
  client_name: { type: String, default: 'ChatGPT' },
  redirect_uris: { type: [String], required: true },
}, { timestamps: true });

module.exports = mongoose.model('OAuthClient', OAuthClientSchema);
