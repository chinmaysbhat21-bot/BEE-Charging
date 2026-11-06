import mongoose from 'mongoose'

const schema = new mongoose.Schema({
    chargingPointId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true },
    chargingPointName: { type: String, default: '', immutable: true },
    connectorTypes: { type: [String], default: [], immutable: true },
    station: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    incident: { type: mongoose.Schema.Types.ObjectId, default: null },
    type: { type: String, enum: ['REPORTED', 'REPAIR_DECLARED', 'PROBATION_EXPIRED', 'ADMIN_REACTIVATED'], required: true },
    at: { type: Date, required: true },
    actor: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    details: mongoose.Schema.Types.Mixed,
}, { versionKey: false })
// Application-level append-only protection; production DB roles must also deny updates/deletes.
schema.pre('save', function () { if (!this.isNew) throw new Error('Incident events are append-only.') })
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
    schema.pre(operation, function () { throw new Error('Incident events are append-only.') })
}
schema.index({ station: 1, chargingPointId: 1, at: 1 })
export default mongoose.model('IncidentEvent', schema)
