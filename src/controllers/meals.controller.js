const { validationResult } = require('express-validator');
const MealEntry = require('../models/meal.model');

exports.create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const body = req.body;
    body.user_id = req.user.id; // bind owner
    const doc = await MealEntry.create(body);
    res.status(201).json(doc);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

exports.list = async (req, res) => {
  const { date } = req.query;
  const q = { user_id: req.user.id };
  if (date) q.date = date;
  const items = await MealEntry.find(q).sort({ createdAt: -1 });
  res.json(items);
};
