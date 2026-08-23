const mongoose = require('mongoose');

const BodyProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date_key: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  image_path: { type: String, required: true },
}, { timestamps: true });

BodyProgressSchema.index({ userId: 1, date_key: 1 }, { unique: true });
module.exports = mongoose.model('BodyProgress', BodyProgressSchema);
