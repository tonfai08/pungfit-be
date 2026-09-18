const { mongoose, bk_options, bk_ref, bk_text, bk_model } = require('./bk_shared');

const bk_audit_logsSchema = new mongoose.Schema({
  actor_id: bk_ref('bk_users'),
  action: bk_text(true, 100),
  entity_type: { ...bk_text(true, 100), match: /^bk_[a-z_]+$/ },
  entity_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  event_id: bk_ref('bk_events'),
  changes_json: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  reason: bk_text(false, 2000),
}, { ...bk_options, timestamps: { createdAt: 'created_at', updatedAt: false } });
bk_audit_logsSchema.index({ event_id: 1, created_at: -1 });
bk_audit_logsSchema.index({ entity_type: 1, entity_id: 1, created_at: -1 });

module.exports = bk_model('bk_audit_logs', bk_audit_logsSchema);
