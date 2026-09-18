const mongoose = require('mongoose');

const bk_options = {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  optimisticConcurrency: true,
};

function bk_ref(model, required = false) {
  return { type: mongoose.Schema.Types.ObjectId, ref: model, required, ...(required ? {} : { default: null }) };
}

function bk_integer(min = 0, extra = {}) {
  return {
    type: Number,
    min,
    validate: { validator: Number.isSafeInteger, message: '{PATH} must be a safe integer' },
    ...extra,
  };
}

function bk_text(required = false, maxlength = 255) {
  return { type: String, trim: true, required, maxlength };
}

function bk_enum(values, defaultValue) {
  return { type: String, enum: values, required: true, default: defaultValue };
}

function bk_model(name, schema) {
  // Explicit collection names avoid Mongoose pluralization changing the namespace.
  return mongoose.model(name, schema, name);
}

function bk_orderedDates(schema, pairs) {
  schema.pre('validate', function () {
    for (const [earlier, later] of pairs) {
      if (this[earlier] && this[later] && this[earlier] >= this[later]) {
        this.invalidate(later, `${later} must be after ${earlier}`);
      }
    }
  });
}

function bk_objectFields(parentModel) {
  return {
    parent_object_id: bk_ref(parentModel),
    kind: bk_enum(['table', 'chair', 'stage', 'entrance', 'text'], 'table'),
    label: bk_text(false, 100),
    x: { type: Number, required: true, validate: Number.isFinite },
    y: { type: Number, required: true, validate: Number.isFinite },
    width: { type: Number, required: true, min: 1, validate: Number.isFinite },
    height: { type: Number, required: true, min: 1, validate: Number.isFinite },
    rotation: { type: Number, default: 0, min: 0, max: 359.999 },
    z_index: bk_integer(0, { default: 0 }),
    properties_json: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  };
}

module.exports = { mongoose, bk_options, bk_ref, bk_integer, bk_text, bk_enum, bk_model, bk_orderedDates, bk_objectFields };
