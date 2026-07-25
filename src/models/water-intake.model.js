const mongoose = require('mongoose');

const WaterIntakeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    amount_ml: {
      type: Number,
      required: true,
      min: 1,
    },
    logged_at: {
      type: Date,
      required: true,
      default: Date.now,
    },
    source: {
      type: String,
      enum: ['water', 'coffee', 'tea', 'sports_drink', 'other'],
      default: 'water',
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

WaterIntakeSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('WaterIntake', WaterIntakeSchema);
