import mongoose from 'mongoose'
import ChargingStation from '../models/ChargingStation.js'
import Booking from '../models/Booking.js'
import ChargingIncident, { ISSUE_CATEGORIES } from '../models/ChargingIncident.js'
import IncidentEvent from '../models/IncidentEvent.js'

export function fail(statusCode, message) { throw Object.assign(new Error(message), { statusCode }) }
export function healthState(station, now = new Date()) {
    const health = station.chargeGuard
    if (health?.state === 'PROBATION' && health.probationUntil && new Date(health.probationUntil) <= now) return 'ACTIVE'
    return health?.state || 'ACTIVE'
}
export function assertBookable(station) {
    if (['PAUSED', 'SUSPENDED'].includes(healthState(station))) fail(409, 'ChargeGuard has paused reservations at this station. Existing bookings are preserved.')
}
export function eligibleBooking(booking, consumerId, now = new Date()) {
    return Boolean(booking && String(booking.consumerId) === String(consumerId) && booking.status === 'confirmed' &&
        new Date(booking.startAt) <= now && new Date(booking.endAt).getTime() + 24 * 60 * 60 * 1000 >= now.getTime())
}
function text(value, label, required = true) {
    if (value === undefined && !required) return ''
    if (typeof value !== 'string' || value.trim().length > 2000 || (required && !value.trim())) fail(400, `${label} must be ${required ? '1–2000' : '0–2000'} characters.`)
    return value.trim()
}
function objectId(value) { if (!mongoose.isValidObjectId(value)) fail(400, 'Invalid record ID.') }
async function transaction(work) {
    return mongoose.connection.transaction(work)
}
async function event(station, incident, type, actor, from, now, session, details) {
    await IncidentEvent.create([{ station: station._id, incident, type, actor, from, to: station.chargeGuard.state, at: now, details }], { session })
}
async function expire(station, session, now) {
    if (station.chargeGuard?.state === 'PROBATION' && healthState(station, now) === 'ACTIVE') {
        station.chargeGuard.state = 'ACTIVE'
        await event(station, null, 'PROBATION_EXPIRED', 'system', 'PROBATION', now, session, { expiredAt: station.chargeGuard.probationUntil })
    }
}
// Lazy expiry is durable and independent of process timers. Call inside a transaction.
export async function expireProbation(station, session) {
    await expire(station, session, new Date())
    if (station.isModified('chargeGuard')) await station.save({ session })
}

export async function reportIssue(consumerId, input) {
    objectId(input.bookingId)
    if (!ISSUE_CATEGORIES.includes(input.category)) fail(400, 'Choose a valid charging issue.')
    const description = text(input.description, 'Explanation', false)
    return transaction(async (session) => {
        const now = new Date()
        const booking = await Booking.findById(input.bookingId).session(session)
        if (!booking || String(booking.consumerId) !== String(consumerId)) fail(404, 'Booking not found.')
        if (!eligibleBooking(booking, consumerId, now)) fail(409, 'Report during your confirmed booking or within 24 hours after it ends.')
        const station = await ChargingStation.findById(booking.station).session(session)
        if (!station) fail(404, 'Station not found.')
        if (await ChargingIncident.exists({ booking: booking._id, category: input.category }).session(session)) fail(409, 'This issue has already been reported for this booking.')
        await expire(station, session, now)
        const from = station.chargeGuard.state
        // A late report about a pre-repair attempt is not evidence of a failed repair.
        const prior = await ChargingIncident.findOne({ station: station._id, category: input.category,
            booking: { $ne: booking._id }, 'repair.at': { $lte: booking.startAt, ...(station.chargeGuard.reviewedAt ? { $gt: station.chargeGuard.reviewedAt } : {}) },
            'repair.probationUntil': { $gt: now },
        }).session(session)
        const suspended = from === 'SUSPENDED' || Boolean(prior)
        station.chargeGuard.state = suspended ? 'SUSPENDED' : 'PAUSED'
        if (prior && from !== 'SUSPENDED') {
            station.chargeGuard.suspensionCount += 1
            station.chargeGuard.suspensionReason = `Independent repeat report: ${input.category}; prior incident ${prior._id}`
        }
        const [incident] = await ChargingIncident.create([{ station: station._id, booking: booking._id,
            consumerId: String(consumerId), hostId: station.hostId, category: input.category, description,
            reportedAt: now, reviewRequired: suspended,
        }], { session })
        await station.save({ session }) // Conflicts with booking writes, serializing reservation/report races.
        await event(station, incident._id, 'REPORTED', String(consumerId), from, now, session,
            { category: input.category, priorIncident: prior?._id, suspensionReason: station.chargeGuard.suspensionReason })
        return incident
    })
}

export async function declareRepair(hostId, incidentId, input) {
    objectId(incidentId)
    const problem = text(input.problem, 'Problem description')
    const fix = text(input.fix, 'Repair description')
    if (input.tested !== true) fail(400, 'Confirm a post-repair test was performed.')
    const hours = Number(process.env.CHARGEGUARD_PROBATION_HOURS || 24)
    if (!Number.isFinite(hours) || hours <= 0 || hours > 720) fail(503, 'Invalid probation configuration.')
    return transaction(async (session) => {
        const now = new Date()
        const incident = await ChargingIncident.findById(incidentId).session(session)
        if (!incident) fail(404, 'Incident not found.')
        const station = await ChargingStation.findById(incident.station).session(session)
        if (!station || String(station.hostId) !== String(hostId)) fail(403, 'Only the station owner can declare a repair.')
        if (station.chargeGuard.state === 'SUSPENDED') fail(409, 'Administrator review is required. Hosts cannot reactivate suspended stations.')
        if (incident.resolvedAt) fail(409, 'This incident has already been resolved.')
        const from = station.chargeGuard.state
        const probationUntil = new Date(now.getTime() + hours * 3600000)
        incident.repair = { problem, fix, tested: true, at: now, probationUntil, hostId: String(hostId) }
        incident.resolvedAt = now
        await incident.save({ session })
        const pending = await ChargingIncident.exists({ station: station._id, resolvedAt: null }).session(session)
        station.chargeGuard.state = pending ? 'PAUSED' : 'PROBATION'
        station.chargeGuard.repairAt = now
        station.chargeGuard.probationUntil = probationUntil
        await station.save({ session })
        await event(station, incident._id, 'REPAIR_DECLARED', String(hostId), from, now, session, { problem, fix, tested: true, at: now, probationUntil })
        return incident
    })
}

export async function reactivateStation(stationId, input) {
    objectId(stationId)
    const decision = text(input.decision, 'Review decision')
    const reviewer = text(input.reviewer, 'Reviewer identifier')
    return transaction(async (session) => {
        const now = new Date()
        const station = await ChargingStation.findById(stationId).session(session)
        if (!station) fail(404, 'Station not found.')
        if (station.chargeGuard.state !== 'SUSPENDED') fail(409, 'Only suspended stations require administrative reactivation.')
        station.chargeGuard.state = 'ACTIVE'
        station.chargeGuard.reviewedAt = now
        // Keep prior suspension reason, counts, reports and repair timestamps for audit.
        await station.save({ session })
        await ChargingIncident.updateMany({ station: station._id, resolvedAt: null }, { $set: { resolvedAt: now } }, { session })
        await event(station, null, 'ADMIN_REACTIVATED', `admin:${reviewer}`, 'SUSPENDED', now, session, { decision })
        return station
    })
}
