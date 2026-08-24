const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const auth = require('../middlewares/auth');
const {
  createMealRecord,
  getMealsByDate,
  analyzeMealImage,
  analyzeMealText,
  deleteMeal,
} = require('../controllers/meals.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (!allowed.includes(ext) || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only images are allowed (png, jpg, jpeg, webp)'));
    }

    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadImage = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Invalid image upload' });
    }

    next();
  });
};

router.use(auth);

router.post('/analyze-image', uploadImage, analyzeMealImage);
router.post('/analyze-text', analyzeMealText);
router.post('/', createMealRecord);
router.get('/', getMealsByDate);
router.delete('/:id', deleteMeal);

module.exports = router;
