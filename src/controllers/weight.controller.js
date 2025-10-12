
const WeightRecord = require('../models/weight.model');
const User = require('../models/user.model');

exports.upsertTodayWeight = async (req, res) => {
  try {
    const { weight_kg } = req.body;
    const userId = req.user.id;

    if (!weight_kg) {
      return res.status(400).json({ error: "Weight is required" });
    }

    const today = new Date();
    const start = new Date(today.setHours(0, 0, 0, 0));
    const end = new Date(today.setHours(23, 59, 59, 999));

    const record = await WeightRecord.findOneAndUpdate(
      { userId, date: { $gte: start, $lte: end } },
      { userId, weight_kg, date: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await User.findByIdAndUpdate(userId, { weight_kg });

    return res.json({ success: true, record });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.getWeightHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    // ดึงข้อมูลจาก WeightRecord ของ user นี้
    const records = await WeightRecord.find({ userId })
      .sort({ date: -1 })            // 🔁 เรียงจาก "ใหม่สุด → เก่าสุด"
      .limit(limit)                  // 🔢 จำกัดจำนวนข้อมูล
      .select("weight_kg date")
      .lean();                       // 🧠 แปลงผลลัพธ์เป็น plain JS object (เร็วขึ้น)

    // 🔁 กลับลำดับให้เก่าสุดอยู่ก่อน (เพื่อวาดกราฟเรียงเวลาได้ถูก)
    const sortedRecords = records.reverse();

    res.json(sortedRecords);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
