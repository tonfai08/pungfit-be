const mongoose = require('mongoose');

const WerewolfRoleSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    team: { type: String, enum: ['villager', 'werewolf', 'neutral'], default: 'villager' },
    description: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WerewolfRole', WerewolfRoleSchema);
