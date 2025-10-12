const User = require('../models/user.model');
const WeightRecord = require('../models/weight.model');


// ✅ อัปเดตข้อมูลผู้ใช้ (ยกเว้น id, email)
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.user; // จาก middleware auth
    const updates = { ...req.body };

    // 🔒 ป้องกันไม่ให้อัปเดต id หรือ email ผ่าน body
    delete updates._id;
    delete updates.id;
    delete updates.email;
    delete updates.password;
    
    const user = await User.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (updates.weight_kg) {
      const today = new Date();
      const start = new Date(today.setHours(0, 0, 0, 0));
      const end = new Date(today.setHours(23, 59, 59, 999));

      await WeightRecord.findOneAndUpdate(
        { userId: id, date: { $gte: start, $lte: end } },
        { userId: id, weight_kg: updates.weight_kg, date: new Date() },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    return res.json({
      message: 'User updated successfully',
      user: {
        id: user._id,
        display_name: user.display_name,
        height_cm: user.height_cm,
        weight_kg: user.weight_kg,
        body_fat_percent: user.body_fat_percent,
        gender: user.gender,
        age: user.age
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ✅ ดึงข้อมูลโปรไฟล์ปัจจุบัน
exports.getMe = async (req, res) => {
  try {
    const { id } = req.user; // มาจาก middleware auth
    const user = await User.findById(id).select('-password_hash'); // ไม่ส่ง password ออกไป

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      id: user._id,
      email: user.email,
      display_name: user.display_name,
      height_cm: user.height_cm,
      weight_kg: user.weight_kg,
      body_fat_percent: user.body_fat_percent,
      gender: user.gender,
      age: user.age,
      units: user.units,
      privacy: user.privacy
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
