const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    join_code: { type: String, unique: true, index: true }, 
  },
  { timestamps: true }
);

module.exports = mongoose.model('Group', GroupSchema);
