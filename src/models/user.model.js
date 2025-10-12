const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
    index: true,
    required: true,
    lowercase: true,
    trim: true,
  },
  password_hash: {
    type: String,
    required: true,
  },
  display_name: {
    type: String,
    index: true,
    maxlength: 15, // ✅ จำกัดชื่อไม่เกิน 15 ตัวอักษร
    trim: true,
  },

  height_cm: {
    type: Number,
    min: 90,   // ✅ ต่ำสุด 90 cm
    max: 230,  // ✅ สูงสุด 230 cm
  },
  weight_kg: {
    type: Number,
    min: 20,   // ✅ ต่ำสุด 20 kg
    max: 200,  // ✅ สูงสุด 200 kg
  },
  body_fat_percent: Number,

  age: {
    type: Number,
    min: 0,
    max: 120,
  },
  dob: Date,
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
  },

  units: {
    weight: { type: String, default: 'kg' },
    height: { type: String, default: 'cm' },
    energy: { type: String, default: 'kcal' },
  },

  privacy: {
    default_visibility: {
      type: String,
      enum: ['friends', 'groups', 'private'],
      default: 'groups',
    },
  },
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
