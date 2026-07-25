const mongoose = require('mongoose');

const WeightRecordSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    weight_kg:{
    type: Number,
    min: 20,   
    max: 200, 
  },
    date: { type: Date, required: true },
  },
  { timestamps: true }
);

WeightRecordSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('WeightRecord', WeightRecordSchema);