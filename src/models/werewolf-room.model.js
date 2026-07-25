const mongoose = require('mongoose');

const WerewolfPlayerSchema = new mongoose.Schema(
  {
    player_code: { type: String, required: true, trim: true },
    display_name: { type: String, required: true, trim: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'WerewolfRole', default: null },
    role_code: { type: String, default: null, trim: true },
    role_name: { type: String, default: null, trim: true },
    joined_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const WerewolfRoleSlotSchema = new mongoose.Schema(
  {
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'WerewolfRole', required: true },
    count: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const WerewolfRoomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    creator_code: { type: String, required: true, trim: true },
    creator_name: { type: String, required: true, trim: true },
    join_code: { type: String, unique: true, index: true },
    status: { type: String, enum: ['waiting', 'started', 'finished'], default: 'waiting' },
    max_players: { type: Number, default: 8, min: 1 },
    role_slots: { type: [WerewolfRoleSlotSchema], default: [] },
    players: { type: [WerewolfPlayerSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WerewolfRoom', WerewolfRoomSchema);
