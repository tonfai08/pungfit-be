const mongoose = require('mongoose');

const ExerciseLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    exerciseMasterId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExerciseMaster', default: null },
    type: { type: String, enum: ['cardio', 'weight'], default: 'weight' },

    set1_weight_kg: { type: Number, min: 0 },
    set1_reps: { type: Number, min: 0 },
    set2_weight_kg: { type: Number, min: 0 },
    set2_reps: { type: Number, min: 0 },
    set3_weight_kg: { type: Number, min: 0 },
    set3_reps: { type: Number, min: 0 },
    set4_weight_kg: { type: Number, min: 0 },
    set4_reps: { type: Number, min: 0 },
    set5_weight_kg: { type: Number, min: 0 },
    set5_reps: { type: Number, min: 0 },

    duration_min: { type: Number, min: 0 },
    intensity: { type: String, enum: ['low', 'moderate', 'high'] },
    notes: { type: String, trim: true },
    performed_at: { type: Date, required: true },
    source: { type: String, enum: ['app', 'mcp'], default: 'app' },
    client_request_id: { type: String, trim: true },
  },
  { timestamps: true }
);

ExerciseLogSchema.index({ userId: 1, performed_at: -1 });
ExerciseLogSchema.index(
  { userId: 1, client_request_id: 1 },
  {
    unique: true,
    partialFilterExpression: { client_request_id: { $type: 'string' } },
  }
);

module.exports = mongoose.model('ExerciseLog', ExerciseLogSchema);
