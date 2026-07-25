const mongoose = require('mongoose');

const DayItemSchema = new mongoose.Schema(
  {
    exerciseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExerciseMaster', required: true },
    type: { type: String, enum: ['strength', 'cardio'], default: 'strength' },
    sets: { type: Number, min: 1 },
    reps: { type: Number, min: 1 },
    weight: { type: Number, min: 0 },
    rpe: { type: Number, min: 1, max: 10 },
    time_min: { type: Number, min: 1 },
    distance_km: { type: Number, min: 0 },
    intensity: { type: String, enum: ['low', 'moderate', 'high'] },
    notes: { type: String, trim: true },
  },
  { _id: false }
);

const UserWorkoutPlanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    weekLabel: { type: String, required: true, trim: true },
    days: {
      mon: [DayItemSchema],
      tue: [DayItemSchema],
      wed: [DayItemSchema],
      thu: [DayItemSchema],
      fri: [DayItemSchema],
      sat: [DayItemSchema],
      sun: [DayItemSchema],
    },
    note: { type: String, trim: true },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

UserWorkoutPlanSchema.index({ userId: 1, weekLabel: 1 }, { unique: true });

module.exports = mongoose.model('UserWorkoutPlan', UserWorkoutPlanSchema);
