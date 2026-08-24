const mongoose = require('mongoose');

const MUSCLE_GROUP_TREE = [
  { key: 'arms', label: 'Arms', children: ['upper_arm', 'forearm'] },
  { key: 'upper_arm', label: 'Upper Arm', children: ['biceps', 'triceps'] },
  { key: 'forearm', label: 'Forearm' },
  { key: 'shoulders', label: 'Shoulders', children: ['front_delts', 'side_delts', 'rear_delts'] },
  { key: 'chest', label: 'Chest' },
  { key: 'back', label: 'Back', children: ['upper_back', 'lats', 'lower_back'] },
  { key: 'core', label: 'Core', children: ['abs', 'obliques'] },
  { key: 'legs', label: 'Legs', children: ['upper_leg', 'lower_leg', 'glutes'] },
  { key: 'upper_leg', label: 'Upper Leg', children: ['quadriceps', 'hamstrings'] },
  { key: 'lower_leg', label: 'Lower Leg', children: ['calves'] },
  { key: 'glutes', label: 'Glutes' },
];

const MUSCLE_GROUP_VALUES = Array.from(
  new Set(
    MUSCLE_GROUP_TREE.reduce((acc, group) => {
      acc.push(group.key);
      if (Array.isArray(group.children)) {
        acc.push(...group.children);
      }
      return acc;
    }, [])
  )
);

const ExerciseMasterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    aliases: [{ type: String, trim: true }],
    language: { type: String, default: 'th' },

    primary_muscles: [{ type: String, required: true }],
    secondary_muscles: [{ type: String }],
    muscle_groups: [
      {
        type: String,
        enum: MUSCLE_GROUP_VALUES,
      },
    ],

    movement_pattern: {
      type: String,
      enum: ['push', 'pull', 'hinge', 'squat', 'carry', 'core', 'isolation', 'cardio'],
      default: 'push',
    },
    plane_of_motion: {
      type: String,
      enum: ['sagittal', 'frontal', 'transverse', 'multi'],
      default: 'sagittal',
    },

    equipment: [{ type: String }],
    is_bodyweight: { type: Boolean, default: false },

    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    contraindications: { type: String, trim: true },

    setup_cues: [{ type: String }],
    execution_notes: { type: String, trim: true },
    common_errors: [{ type: String }],

    media: {
      video_url: { type: String, trim: true },
      image_url: { type: String, trim: true },
      source: { type: String, trim: true },
      source_url: { type: String, trim: true },
      license: { type: String, trim: true },
      license_url: { type: String, trim: true },
      attribution: { type: String, trim: true },
    },

    metrics_supported: {
      reps: { type: Boolean, default: true },
      weight: { type: Boolean, default: true },
      time: { type: Boolean, default: false },
      distance: { type: Boolean, default: false },
      rpe: { type: Boolean, default: true },
    },

    muscle_emphasis: mongoose.Schema.Types.Mixed,

    variation_tags: [{ type: String }],
    parentExerciseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExerciseMaster' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    visibility: { type: String, enum: ['global', 'coach', 'private'], default: 'global' },
    is_archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ExerciseMasterSchema.index({ name: 1, language: 1 }, { unique: true });

module.exports = mongoose.model('ExerciseMaster', ExerciseMasterSchema);

module.exports.MUSCLE_GROUP_TREE = MUSCLE_GROUP_TREE;
module.exports.MUSCLE_GROUP_VALUES = MUSCLE_GROUP_VALUES;
