const ExerciseLog = require('../models/exercise-log.model');

const isOwnerOrAdmin = (log, user) => {
  if (!log || !user) return false;
  if (user.role === 'admin') return true;
  return log.userId.toString() === user.id;
};

const createExerciseLog = async (user, payload) => {
  const performedAt = payload.performed_at ? new Date(payload.performed_at) : new Date();

  return ExerciseLog.create({
    ...payload,
    userId: user.id,
    exerciseMasterId: payload.exerciseMasterId || null,
    performed_at: performedAt,
  });
};

const updateExerciseLog = async (id, user, updates) => {
  const log = await ExerciseLog.findById(id);
  if (!log) {
    const err = new Error('Exercise log not found');
    err.status = 404;
    throw err;
  }

  if (!isOwnerOrAdmin(log, user)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }

  const safeUpdates = { ...updates };
  delete safeUpdates.userId;
  delete safeUpdates.createdAt;
  delete safeUpdates.updatedAt;
  delete safeUpdates._id;
  delete safeUpdates.id;

  if (safeUpdates.performed_at) {
    safeUpdates.performed_at = new Date(safeUpdates.performed_at);
  }

  return ExerciseLog.findByIdAndUpdate(id, safeUpdates, { new: true, runValidators: true });
};

const deleteExerciseLog = async (id, user) => {
  const log = await ExerciseLog.findById(id);
  if (!log) {
    const err = new Error('Exercise log not found');
    err.status = 404;
    throw err;
  }

  if (!isOwnerOrAdmin(log, user)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }

  await ExerciseLog.deleteOne({ _id: id });
  return log;
};

const getExerciseLogsByUser = async (user, opts = {}) => {
  const query = { userId: user.id };

  if (opts.start || opts.end) {
    query.performed_at = {};
    if (opts.start) query.performed_at.$gte = opts.start;
    if (opts.end) query.performed_at.$lte = opts.end;
  }

  return ExerciseLog.find(query).sort({ performed_at: -1 });
};

module.exports = {
  createExerciseLog,
  updateExerciseLog,
  deleteExerciseLog,
  getExerciseLogsByUser,
};
