const User = require('../models/user.model');
const WeightRecord = require('../models/weight.model');

const activityMultipliers = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

function calculateBMR(weight, height, age, gender) {
  if (!weight || !height || !age) return null;
  return 10 * weight + 6.25 * height - 5 * age + (gender === 'male' ? 5 : -161);
}

function calculateTDEEandMacros(user) {
  const { weight_kg, height_cm, age, gender, activity_level } = user;
  const bmr = calculateBMR(weight_kg, height_cm, age, gender);
  const multiplier = activityMultipliers[activity_level || 'sedentary'];
  const tdeeValue = bmr && multiplier ? bmr * multiplier : null;

  if (!tdeeValue) return { bmr: null, tdee: null };

  const protein = weight_kg * 2; // 2g/kg
  const fat = weight_kg * 1;     // 1g/kg
  const proteinKcal = protein * 4;
  const fatKcal = fat * 9;
  const carbsKcal = tdeeValue - (proteinKcal + fatKcal);
  const carbs = carbsKcal / 4;

  return {
    bmr,
    tdee: {
      calories: Math.round(tdeeValue),
      protein: Math.round(protein),
      fat: Math.round(fat),
      carbs: Math.round(carbs),
    },
  };
}

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.user;
    const updates = { ...req.body };

    // ป้องกันอัปเดต field สำคัญ
    delete updates._id;
    delete updates.id;
    delete updates.email;
    delete updates.password;
    delete updates.role;

    const user = await User.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    // ✅ ตรวจสอบว่ามี field ที่กระทบกับ TDEE เปลี่ยนไหม
    const changedKeys = ['weight_kg', 'height_cm', 'age', 'gender', 'activity_level'];
    const shouldRecalc = changedKeys.some((k) => updates[k] !== undefined);

    if (shouldRecalc) {
      const { bmr, tdee } = calculateTDEEandMacros(user);
      user.bmr = bmr;
      user.tdee = tdee;
      await user.save();
    }

    // ✅ ถ้าน้ำหนักเปลี่ยน — บันทึก WeightRecord
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
        role: user.role,
        height_cm: user.height_cm,
        weight_kg: user.weight_kg,
        body_fat_percent: user.body_fat_percent,
        gender: user.gender,
        age: user.age,
        activity_level: user.activity_level,
        bmr: user.bmr,
        tdee: user.tdee,
        profile_image: user.profile_image,
        last_login: user.last_login,
      },
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
    user.last_login = new Date();
    await user.save();

    return res.json({
      id: user._id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      height_cm: user.height_cm,
      weight_kg: user.weight_kg,
      body_fat_percent: user.body_fat_percent,
      gender: user.gender,
      age: user.age,
       activity_level: user.activity_level,  
      bmr: user.bmr,                        
      tdee: user.tdee,  
      units: user.units,
      privacy: user.privacy,
      profile_image: user.profile_image,
      last_login: user.last_login
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const imagePath = `/uploads/profile_images/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { profile_image: imagePath },
      { new: true }
    ).select('-password_hash');

    res.json({
      message: 'Profile image updated successfully',
      profile_image: user.profile_image
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to upload profile image' });
  }
};
