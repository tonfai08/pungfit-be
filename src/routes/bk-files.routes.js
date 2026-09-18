const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  models,
  objectId,
  requireValue,
  findOrFail,
} = require('../services/bk-common');
const router = express.Router();
const directory = () =>
  path.resolve(
    process.env.BK_UPLOAD_DIR || path.join(__dirname, '../../bk_uploads'),
  );
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
});
router.post('/files', upload.single('image'), async (req, res) => {
  requireValue(req.file, 'กรุณาเลือกรูปภาพ');
  let bytes;
  try {
    bytes = await sharp(req.file.buffer, { limitInputPixels: 25000000 })
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 88 })
      .toBuffer();
  } catch {
    requireValue(
      false,
      'รองรับเฉพาะรูปภาพที่อ่านได้ ขนาดไม่เกิน 6 MB และ 25 ล้านพิกเซล',
    );
  }
  await fs.mkdir(directory(), { recursive: true });
  const key = `${crypto.randomUUID()}.webp`;
  const target = path.join(directory(), key);
  await fs.writeFile(target, bytes, { flag: 'wx' });
  try {
    const file = await models.bk_files.create({
      storage_key: key,
      original_name: path.basename(req.file.originalname).slice(0, 255),
      mime_type: 'image/webp',
      size_bytes: bytes.length,
      access_level: 'private',
      uploaded_by: req.bkUser._id,
    });
    res.status(201).json({ _id: file._id, url: `/bk-api/files/${file._id}` });
  } catch (error) {
    await fs.unlink(target);
    throw error;
  }
});
router.get('/files/:id', async (req, res) => {
  objectId.parse(req.params.id);
  const file = await findOrFail(models.bk_files, { _id: req.params.id });
  requireValue(
    /^[a-f\d-]+\.webp$/i.test(file.storage_key),
    'ไฟล์ไม่ถูกต้อง',
    404,
  );
  res.type('image/webp').set('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.join(directory(), file.storage_key));
});
module.exports = router;
