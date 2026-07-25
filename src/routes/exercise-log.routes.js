const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const {
  createExerciseLog,
  updateExerciseLog,
  deleteExerciseLog,
  getMyExerciseLogs,
} = require('../controllers/exercise-log.controller');

router.use(auth);

router.post('/', createExerciseLog);
router.get('/', getMyExerciseLogs);
router.put('/:id', updateExerciseLog);
router.delete('/:id', deleteExerciseLog);

module.exports = router;
