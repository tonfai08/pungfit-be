const mongoose = require('mongoose');

const FoodMasterSchema = new mongoose.Schema(
  {
    barcode: { type: String, unique: true, sparse: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    food_name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    brand: { type: String, default: '', trim: true }, // ผู้ผลิตหรือแบรนด์

    // ข้อมูลหน่วยเสิร์ฟมาตรฐาน เผื่อใช้คำนวณสัดส่วน
    servingSize: { type: Number, default: 100 },
    servingUnit: { type: String, default: 'g', trim: true },

    // สารอาหารหลัก
    calories: { type: Number, default: 0 },
    protein: { type: Number, default: 0 },
    fat: { type: Number, default: 0 },
    carbs: { type: Number, default: 0 },

    // สารอาหารย่อยเพิ่มเติม
    sugar: { type: Number, default: 0 }, // น้ำตาล
    fiber: { type: Number, default: 0 }, // ใยอาหาร
    sodium: { type: Number, default: 0 }, // โซเดียม (mg)
    cholesterol: { type: Number, default: 0 }, // คอเลสเตอรอล (mg)
    calcium: { type: Number, default: 0 }, // แคลเซียม (mg)
    iron: { type: Number, default: 0 }, // เหล็ก (mg)
    potassium: { type: Number, default: 0 }, // โพแทสเซียม (mg)
    vitaminC: { type: Number, default: 0 }, // วิตามินซี (mg)
    vitaminD: { type: Number, default: 0 }, // วิตามินดี (IU)
  },
  { timestamps: true }
);

module.exports = mongoose.model('FoodMaster', FoodMasterSchema);
