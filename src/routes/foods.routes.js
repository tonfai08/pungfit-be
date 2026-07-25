const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const {
  createFood,
  createFoodsBulk,
  getFoodByBarcode,
  getFoodsPublic,
  getFoodsMe,
  updateFood,
} = require('../controllers/foods.controller');

router.use(auth);

router.post('/', createFood);
router.post('/bulk', createFoodsBulk);
router.get('/public', getFoodsPublic);
router.get('/me', getFoodsMe);
router.get('/barcode/:barcode', getFoodByBarcode);
router.patch('/:id', updateFood);

module.exports = router;
