const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, index: true, required: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  display_name: { type: String, index: true },
  height_cm: Number,
  dob: Date,
  units: {
    weight: { type: String, default: 'kg' },
    height: { type: String, default: 'cm' },
    energy: { type: String, default: 'kcal' }
  },
  privacy: {
    default_visibility: { type: String, enum: ['friends','groups','private'], default: 'groups' }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
