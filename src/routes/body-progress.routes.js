const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs/promises');
const auth = require('../middlewares/auth');
const BodyProgress = require('../models/body-progress.model');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});
const todayKey = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const uploadDir = path.join('uploads', 'body_progress');

router.get('/', auth, async (req, res) => {
  const allowed = [10, 20, 30, 50];
  const requested = Number(req.query.limit || 10);
  const limit = allowed.includes(requested) ? requested : 10;
  const records = await BodyProgress.find({ userId: req.user.id })
    .sort({ date_key: -1 }).limit(limit);
  res.json({ records, limit, today: todayKey() });
});

router.post('/', auth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image is required' });
  const dateKey = todayKey();
  await fs.mkdir(uploadDir, { recursive: true });
  const filename = `${req.user.id}_${dateKey}.jpg`;
  const filepath = path.join(uploadDir, filename);
  await sharp(req.file.buffer)
    .rotate()
    .resize(900, 1200, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(filepath);
  const imagePath = `/uploads/body_progress/${filename}`;
  const record = await BodyProgress.findOneAndUpdate(
    { userId: req.user.id, date_key: dateKey },
    { image_path: imagePath },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  res.status(201).json({ record, replaced: record.createdAt.getTime() !== record.updatedAt.getTime() });
});

router.delete('/:id', auth, async (req, res) => {
  const record = await BodyProgress.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
  if (!record) return res.status(404).json({ error: 'Record not found' });
  const relativePath = record.image_path.replace(/^\/uploads\//, '');
  await fs.unlink(path.join('uploads', relativePath)).catch(() => {});
  res.json({ success: true });
});

module.exports = router;
