const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const {
  createWaterIntake,
  getWaterIntakesByDate,
  updateWaterIntake,
  deleteWaterIntake,
} = require('../controllers/water-intake.controller');

router.use(auth);

router.post('/', createWaterIntake);
router.get('/', getWaterIntakesByDate);
router.put('/:id', updateWaterIntake);
router.delete('/:id', deleteWaterIntake);

module.exports = router;
