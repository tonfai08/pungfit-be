const ExerciseMaster = require('../models/exercise-master.model');

function ensureAdmin(req, res) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

exports.createExerciseMaster = async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const payload = { ...req.body, createdBy: req.user.id };
    const exercise = await ExerciseMaster.create(payload);
    return res.status(201).json({ message: 'Exercise master created', exercise });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Exercise already exists' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.updateExerciseMaster = async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const updates = { ...req.body };
    delete updates._id;
    delete updates.id;
    delete updates.createdBy;

    const exercise = await ExerciseMaster.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!exercise) {
      return res.status(404).json({ error: 'Exercise master not found' });
    }

    return res.json({ message: 'Exercise master updated', exercise });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getExerciseMasters = async (req, res) => {
  try {
    const exercises = await ExerciseMaster.find({ is_archived: false }).sort({ name: 1 }).lean();
    return res.json({ exercises });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
