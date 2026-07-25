const dayjs = require('dayjs');
const WaterIntake = require('../models/water-intake.model');

const parseDate = (value, fieldName) => {
  const parsed = value ? dayjs(value) : dayjs();
  if (!parsed.isValid()) {
    const error = new Error(`Invalid ${fieldName} format`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
};

const normalizeDateOnly = (value, fieldName = 'date') => parseDate(value, fieldName).startOf('day').toDate();

const parseAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('amount_ml must be greater than 0');
    error.statusCode = 400;
    throw error;
  }
  return amount;
};

const buildDailySummary = (intakes) => ({
  total_ml: intakes.reduce((sum, item) => sum + (item.amount_ml || 0), 0),
  count: intakes.length,
});

exports.createWaterIntake = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount_ml, date, logged_at, source, note } = req.body;

    const loggedAt = parseDate(logged_at, 'logged_at').toDate();
    const dateObj = normalizeDateOnly(date || undefined, 'date');
    const addedAmount = parseAmount(amount_ml);

    let intake = await WaterIntake.findOne({ userId, date: dateObj });
    let statusCode = 200;

    if (intake) {
      intake.amount_ml += addedAmount;
      intake.logged_at = loggedAt;
      if (source !== undefined) intake.source = source;
      if (note !== undefined) intake.note = note;
      await intake.save();
    } else {
      intake = await WaterIntake.create({
        userId,
        date: dateObj,
        amount_ml: addedAmount,
        logged_at: loggedAt,
        source,
        note,
      });
      statusCode = 201;
    }

    return res.status(statusCode).json({
      success: true,
      added_ml: addedAmount,
      total_ml: intake.amount_ml,
      intake,
    });
  } catch (err) {
    console.error('Error creating water intake:', err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Server error' });
  }
};

exports.getWaterIntakesByDate = async (req, res) => {
  try {
    const userId = req.user.id;
    const baseDate = parseDate(req.query.date, 'date');
    const start = baseDate.startOf('day').toDate();
    const end = baseDate.endOf('day').toDate();

    const intakes = await WaterIntake.find({
      userId,
      date: { $gte: start, $lte: end },
    }).sort({ logged_at: 1 });

    return res.json({
      success: true,
      intakes,
      summary: buildDailySummary(intakes),
    });
  } catch (err) {
    console.error('Error fetching water intakes:', err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Server error' });
  }
};

exports.updateWaterIntake = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { amount_ml, date, logged_at, source, note } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    const update = {};
    if (amount_ml !== undefined) update.amount_ml = parseAmount(amount_ml);
    if (logged_at !== undefined) update.logged_at = parseDate(logged_at, 'logged_at').toDate();
    if (date !== undefined) update.date = normalizeDateOnly(date, 'date');
    if (source !== undefined) update.source = source;
    if (note !== undefined) update.note = note;

    if (update.logged_at && date === undefined) {
      update.date = normalizeDateOnly(update.logged_at, 'logged_at');
    }

    const intake = await WaterIntake.findOneAndUpdate(
      { _id: id, userId },
      update,
      { new: true, runValidators: true }
    );

    if (!intake) {
      return res.status(404).json({ error: 'Water intake not found' });
    }

    return res.json({ success: true, intake });
  } catch (err) {
    console.error('Error updating water intake:', err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Server error' });
  }
};

exports.deleteWaterIntake = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    const intake = await WaterIntake.findOneAndDelete({ _id: id, userId });
    if (!intake) {
      return res.status(404).json({ error: 'Water intake not found' });
    }

    return res.json({ success: true, message: 'Water intake deleted', intake });
  } catch (err) {
    console.error('Error deleting water intake:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
