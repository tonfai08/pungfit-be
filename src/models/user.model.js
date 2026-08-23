const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  password_hash: { type: String },
  google_id: { type: String, unique: true, sparse: true, trim: true },
  mcp_access_key_hash: { type: String, select: false, index: true },
  display_name: { type: String, maxlength: 15, trim: true },
  height_cm: { type: Number, min: 90, max: 230 },
  weight_kg: { type: Number, min: 20, max: 200 },
  body_fat_percent: Number,
  age: { type: Number, min: 0, max: 120 },
  dob: Date,
  gender: { type: String, enum: ['male', 'female', 'other'] },
  activity_level: {
    type: String,
    enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
    default: 'sedentary',
  },

  bmr: { type: Number, default: null },
  // ✅ เก็บทั้งพลังงานรวมและสัดส่วนสารอาหาร
  tdee: {
    calories: { type: Number, default: null },
    protein: { type: Number, default: null },
    fat: { type: Number, default: null },
    carbs: { type: Number, default: null },
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

  profile_image: { type: String, default: '', trim: true },
  last_login: { type: Date, default: null },
}, { timestamps: true });


module.exports = mongoose.model('User', UserSchema);
