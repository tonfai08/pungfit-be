const UserWorkoutPlan = require('../models/user-workout-plan.model');

exports.getMyWorkoutPlan = async (req, res) => {
  try {
    const { id } = req.user;
    const { weekLabel } = req.query;

    const query = { userId: id };
    if (weekLabel) query.weekLabel = weekLabel;

    const workoutPlan = await UserWorkoutPlan.findOne(query)
      .sort(weekLabel ? undefined : { createdAt: -1 })
      .populate('days.mon.exerciseId')
      .populate('days.tue.exerciseId')
      .populate('days.wed.exerciseId')
      .populate('days.thu.exerciseId')
      .populate('days.fri.exerciseId')
      .populate('days.sat.exerciseId')
      .populate('days.sun.exerciseId')
      .lean();

    if (!workoutPlan) {
      return res.status(404).json({ error: 'Workout plan not found' });
    }

    return res.json({ workoutPlan });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.upsertMyWorkoutPlan = async (req, res) => {
  try {
    const { id } = req.user;
    const { weekLabel, days, note, is_active } = req.body;

    if (!weekLabel) {
      return res.status(400).json({ error: 'weekLabel is required' });
    }

    const updates = {
      days,
      note,
      is_active,
    };

    const workoutPlan = await UserWorkoutPlan.findOneAndUpdate(
      { userId: id, weekLabel },
      { $set: updates, $setOnInsert: { userId: id, weekLabel } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return res.json({ message: 'Workout plan saved', workoutPlan });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
