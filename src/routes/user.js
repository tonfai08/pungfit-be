const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { updateUser, getMe } = require('../controllers/user.controller');
const User = require('../models/user.model');

// ✅ multer memory storage (ไม่เขียนไฟล์ตรง)
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Only images are allowed (png, jpg, jpeg, webp)'));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// ✅ PUT /me
router.put('/me', auth, updateUser);
router.get('/me', auth, getMe);

// ✅ POST /me/profile-image (resize ก่อนเซฟ)
router.post('/me/profile-image', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // ✅ ตรวจให้แน่ใจว่าโฟลเดอร์มีอยู่
    const uploadDir = 'uploads/profile_images';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // ✅ ตั้งชื่อไฟล์
    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const filename = `${req.user.id}-${Date.now()}${ext}`;
    const filepath = path.join(uploadDir, filename);

    // ✅ Resize และบันทึก
    await sharp(req.file.buffer)
      .resize(400, 400)           // ขนาด 400x400 px
      .toFormat('jpeg')           // บังคับเป็น jpeg
      .jpeg({ quality: 85 })      // ลดขนาดแต่ยังคม
      .toFile(filepath);

    // ✅ เก็บ path ลง DB
    const imagePath = `/uploads/profile_images/${filename}`;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { profile_image: imagePath },
      { new: true }
    ).select('-password_hash');

    res.json({
      message: 'Profile image uploaded and resized successfully',
      profile_image: user.profile_image
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process image' });
  }
});

module.exports = router;
