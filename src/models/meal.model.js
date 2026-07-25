const mongoose = require('mongoose');

const MealSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // วันที่บันทึก (ใช้ Date-only)
  date: {
    type: Date,
    required: true,
  },

  // มื้ออาหาร
  meal_type: {
    type: String,
    enum: ['breakfast', 'lunch', 'dinner', 'snack'],
    required: true,
  },

  // ลำดับของมื้อ (เผื่อมื้อซ้ำ)
  sequence: {
    type: Number,
    default: 1,
  },

  // อ้างอิงถึง master อาหาร (ยังไม่ใช้ตอนนี้)
  food_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FoodMaster',
    default: null,
  },

  // รายละเอียดอาหารที่ผู้ใช้กรอกเอง
  food_name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  barcode: { type: String, default: '', trim: true },

  // สารอาหารหลัก
  calories: { type: Number, default: 0 },
  protein: { type: Number, default: 0 },
  fat: { type: Number, default: 0 },
  carbs: { type: Number, default: 0 },

  // สารอาหารย่อยเพิ่มเติม
  sugar: { type: Number, default: 0 },       // น้ำตาล
  fiber: { type: Number, default: 0 },       // ใยอาหาร
  sodium: { type: Number, default: 0 },      // โซเดียม (mg)
  cholesterol: { type: Number, default: 0 }, // คอเลสเตอรอล (mg)
  calcium: { type: Number, default: 0 },     // แคลเซียม (mg)
  iron: { type: Number, default: 0 },        // เหล็ก (mg)
  potassium: { type: Number, default: 0 },   // โพแทสเซียม (mg)
  vitaminC: { type: Number, default: 0 },    // วิตามินซี (mg)
  vitaminD: { type: Number, default: 0 },    // วิตามินดี (IU)

}, { timestamps: true });

MealSchema.index({ userId: 1, date: 1, meal_type: 1 });

module.exports = mongoose.model('Meal', MealSchema);
