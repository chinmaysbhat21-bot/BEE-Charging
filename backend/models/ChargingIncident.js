import mongoose from 'mongoose'

export const ISSUE_CATEGORIES = ['charging_did_not_start', 'charger_malfunction', 'power_unavailable', 'host_unavailable', 'other']
const schema = new mongoose.Schema({
    station: { type: mongoose.Schema.Types.ObjectId, ref: 'ChargingStation', required: true, immutable: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, immutable: true },
    consumerId: { type: String, required: true, immutable: true },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consumer', default: null, immutable: true, index: true },
    category: { type: String, enum: ISSUE_CATEGORIES, required: true, immutable: true },
    description: { type: String, maxlength: 2000, default: '', immutable: true },
    reportedAt: { type: Date, required: true, immutable: true },
    reviewRequired: { type: Boolean, default: false },
    resolvedAt: Date,
    repair: {
        problem: { type: String, maxlength: 2000 },
        fix: { type: String, maxlength: 2000 },
        tested: Boolean,
        at: Date,
        probationUntil: Date,
        hostId: String,
    },
})
schema.index({ booking: 1, category: 1 }, { unique: true })
export default mongoose.model('ChargingIncident', schema)
