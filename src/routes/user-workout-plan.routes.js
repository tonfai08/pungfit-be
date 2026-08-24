const express = require('express');
const auth = require('../middlewares/auth');
const {
  getMyWorkoutPlan,
  upsertMyWorkoutPlan,
  generateWorkoutPlanWithAI,
} = require('../controllers/user-workout-plan.controller');

const router = express.Router();

router.use(auth);
router.get('/me', getMyWorkoutPlan);
router.put('/me', upsertMyWorkoutPlan);
router.post('/generate-ai', generateWorkoutPlanWithAI);

module.exports = router;
