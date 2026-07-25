const express = require('express');
const auth = require('../middlewares/auth');
const {
  createExerciseMaster,
  getExerciseMasters,
  updateExerciseMaster,
} = require('../controllers/exercise-master.controller');

const router = express.Router();

router.get('/', auth, getExerciseMasters);
router.post('/', auth, createExerciseMaster);
router.put('/:id', auth, updateExerciseMaster);

module.exports = router;
