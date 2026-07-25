const dayjs = require('dayjs');
const exerciseLogService = require('../services/exercise-log.service');

exports.createExerciseLog = async (req, res) => {
  try {
    const log = await exerciseLogService.createExerciseLog(req.user, req.body);
    return res.status(201).json({ success: true, log });
  } catch (err) {
    console.error('Error creating exercise log:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

exports.updateExerciseLog = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const log = await exerciseLogService.updateExerciseLog(id, req.user, req.body);
    return res.json({ success: true, log });
  } catch (err) {
    console.error('Error updating exercise log:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Server error' });
  }
};

exports.deleteExerciseLog = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const log = await exerciseLogService.deleteExerciseLog(id, req.user);
    return res.json({ success: true, message: 'Exercise log deleted', log });
  } catch (err) {
    console.error('Error deleting exercise log:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Server error' });
  }
};

exports.getMyExerciseLogs = async (req, res) => {
  try {
    const { start, end, date } = req.query;
    const opts = {};

    if (date) {
      const baseDate = dayjs(date);
      if (!baseDate.isValid()) {
        return res.status(400).json({ error: 'Invalid date format' });
      }
      opts.start = baseDate.startOf('day').toDate();
      opts.end = baseDate.endOf('day').toDate();
    }

    if (start) {
      const startDate = new Date(start);
      if (Number.isNaN(startDate.getTime())) {
        return res.status(400).json({ error: 'Invalid start date' });
      }
      if (!date) opts.start = startDate;
    }

    if (end) {
      const endDate = new Date(end);
      if (Number.isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid end date' });
      }
      if (!date) opts.end = endDate;
    }

    const logs = await exerciseLogService.getExerciseLogsByUser(req.user, opts);
    return res.json({ success: true, logs });
  } catch (err) {
    console.error('Error fetching exercise logs:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
