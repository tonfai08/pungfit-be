const express = require('express');
const auth = require('../middlewares/auth');
const {
  getMyWorkoutPlan,
  upsertMyWorkoutPlan,
} = require('../controllers/user-workout-plan.controller');

const router = express.Router();

router.use(auth);
router.get('/me', getMyWorkoutPlan);
router.put('/me', upsertMyWorkoutPlan);

module.exports = router;
