const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorEmail: { type: String, default: 'system' },
  actorRole: { type: String, default: 'SYSTEM' },
  action: { type: String, required: true },
  entity: { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  previousData: { type: mongoose.Schema.Types.Mixed, default: null },
  newData: { type: mongoose.Schema.Types.Mixed, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  ipAddress: { type: String, default: null },
  userAgent: { type: String, default: null },
}, {
  timestamps: true,
});

auditLogSchema.index({ actor: 1 });
auditLogSchema.index({ entity: 1, entityId: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
module.exports = AuditLog;
