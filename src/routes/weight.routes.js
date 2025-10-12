const express = require('express');
const auth = require('../middlewares/auth');
const { upsertTodayWeight,getWeightHistory } = require('../controllers/weight.controller.js');
const router = express.Router();

router.use(auth);
router.post("/", upsertTodayWeight);
router.get("/history", getWeightHistory);

module.exports = router;