import mongoose from 'mongoose'

const schema = new mongoose.Schema({
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
export default mongoose.model('IncidentEvent', schema)
