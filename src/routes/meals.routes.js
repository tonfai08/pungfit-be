const express = require('express');
const { body } = require('express-validator');
const auth = require('../middlewares/auth');
const controller = require('../controllers/meals.controller');

const router = express.Router();
router.use(auth);

// สร้างบันทึกมื้ออาหาร
router.post(
  '/',
  [
    body('date').isString().withMessage('date is required (YYYY-MM-DD)'),
    body('meal_type').isIn(['breakfast','lunch','dinner','snack']),
    body('items').isArray({ min: 1 })
  ],
  controller.create
);

// ดึงรายการของผู้ใช้ (ออปชัน: ?date=YYYY-MM-DD)
router.get('/', controller.list);

module.exports = router;
