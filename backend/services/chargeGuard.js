import Ledger from '../models/WalletTransaction.js'
import { releaseBooking, transfer } from './wallet.js'
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
    if (['PAUSED', 'SUSPENDED'].includes(healthState(station))) fail(409, 'ChargeGuard has paused reservations for this dock or legacy station. Existing bookings are preserved.')
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
function targetFor(station, pointId) {
    if (!pointId) return station // Historical station-wide scope is never guessed.
    objectId(pointId)
    const point = station.chargers.id(pointId)
    if (!point) fail(404, 'Dock not found at this station.')
    return point
}
function scope(pointId) { return { chargingPointId: pointId || null } }
function objectId(value) { if (!mongoose.isValidObjectId(value)) fail(400, 'Invalid record ID.') }
async function transaction(work) {
    return mongoose.connection.transaction(work)
}
async function event(station, incident, type, actor, from, now, session, details, target = station) {
    await IncidentEvent.create([{ station: station._id, ...scope(target === station ? null : target._id), chargingPointName: target === station ? '' : target.name, connectorTypes: target === station ? [] : target.connectorTypes, incident, type, actor, from, to: target.chargeGuard.state, at: now, details }], { session })
}
async function expire(station, session, now, target = station) {
    if (target.chargeGuard?.state === 'PROBATION' && healthState(target, now) === 'ACTIVE') {
        target.chargeGuard.state = 'ACTIVE'
        await event(station, null, 'PROBATION_EXPIRED', 'system', 'PROBATION', now, session, { expiredAt: target.chargeGuard.probationUntil }, target)
    }
}
// Lazy expiry is durable and independent of process timers. Call inside a transaction.
export async function expireProbation(station, session) {
    await expire(station, session, new Date())
    for (const point of station.chargers) await expire(station, session, new Date(), point)
    if (station.isModified()) await station.save({ session })
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
        if (input.stationId != null) {
            objectId(input.stationId)
            if (String(input.stationId) !== String(station._id)) fail(403, 'Station does not match this booking.')
        }
        const pointId = booking.chargingPointId || null
        if (!pointId && station.pointBookingEnabled) fail(409, 'This legacy booking has no verified dock assignment. Contact the host; no dock has been paused.')
        if (input.chargingPointId != null) {
            objectId(input.chargingPointId)
            if (String(input.chargingPointId) !== String(pointId)) fail(403, 'Report only the dock assigned to this booking. Legacy bookings have no verified dock assignment.')
        }
        const target = targetFor(station, pointId)
        if (await ChargingIncident.exists({ booking: booking._id, category: input.category }).session(session)) fail(409, 'This issue has already been reported for this booking.')
        await expire(station, session, now, target)
        const from = target.chargeGuard.state
        // A late report about a pre-repair attempt is not evidence of a failed repair.
        const prior = await ChargingIncident.findOne({ station: station._id, ...scope(pointId), category: input.category,
            booking: { $ne: booking._id }, 'repair.at': { $lte: booking.startAt, ...(target.chargeGuard.reviewedAt ? { $gt: target.chargeGuard.reviewedAt } : {}) },
            'repair.probationUntil': { $gt: now },
        }).session(session)
        const suspended = from === 'SUSPENDED' || Boolean(prior)
        target.chargeGuard.state = suspended ? 'SUSPENDED' : 'PAUSED'
        if (prior && from !== 'SUSPENDED') {
            target.chargeGuard.suspensionCount += 1
            target.chargeGuard.suspensionReason = `Independent repeat report: ${input.category}; prior incident ${prior._id}`
        }
        const [incident] = await ChargingIncident.create([{ station: station._id, ...scope(pointId), chargingPointName: pointId ? target.name : '', connectorTypes: pointId ? target.connectorTypes : [], booking: booking._id,
            consumerId: String(consumerId), hostId: station.hostId, category: input.category, description,
            reportedAt: now, reviewRequired: suspended,
        }], { session })
        if (booking.payment?.status === 'RESERVED') {
            await releaseBooking(booking, session)
            booking.sessionOutcome = 'failed'
            await booking.save({ session })
        }
        if (booking.payment?.transactionId) {
            const earning = await Ledger.findOne({ bookingId: booking._id, type: 'EARNING' }).session(session)
            if (earning) await transfer({ userId: earning.userId, role: 'host', amount: earning.amountInPaise, type: 'REVERSAL', key: 'reversal:' + booking.id, bookingId: booking._id, relatedTransactionId: earning._id, description: 'earnings reversed after charging failure report' }, session)
            booking.sessionOutcome = 'failed'
            await booking.save({ session })
        }
        await station.save({ session }) // Conflicts with booking writes, serializing reservation/report races.
        await event(station, incident._id, 'REPORTED', String(consumerId), from, now, session,
            { category: input.category, priorIncident: prior?._id, suspensionReason: target.chargeGuard.suspensionReason }, target)
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
        const target = targetFor(station, incident.chargingPointId)
        if (target.chargeGuard.state === 'SUSPENDED') fail(409, 'Administrator review is required. Hosts cannot reactivate suspended docks or legacy stations.')
        if (incident.resolvedAt) fail(409, 'This incident has already been resolved.')
        const from = target.chargeGuard.state
        const probationUntil = new Date(now.getTime() + hours * 3600000)
        incident.repair = { problem, fix, tested: true, at: now, probationUntil, hostId: String(hostId) }
        incident.resolvedAt = now
        await incident.save({ session })
        const pending = await ChargingIncident.exists({ station: station._id, ...scope(incident.chargingPointId), resolvedAt: null }).session(session)
        target.chargeGuard.state = pending ? 'PAUSED' : 'PROBATION'
        target.chargeGuard.repairAt = now
        target.chargeGuard.probationUntil = probationUntil
        await station.save({ session })
        await event(station, incident._id, 'REPAIR_DECLARED', String(hostId), from, now, session, { problem, fix, tested: true, at: now, probationUntil }, target)
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
        const target = targetFor(station, input.chargingPointId)
        if (target.chargeGuard.state !== 'SUSPENDED') fail(409, 'Only suspended docks or legacy stations require administrative reactivation.')
        target.chargeGuard.state = 'ACTIVE'
        target.chargeGuard.reviewedAt = now
        // Keep prior suspension reason, counts, reports and repair timestamps for audit.
        await station.save({ session })
        await ChargingIncident.updateMany({ station: station._id, ...scope(input.chargingPointId), resolvedAt: null }, { $set: { resolvedAt: now } }, { session })
        await event(station, null, 'ADMIN_REACTIVATED', `admin:${reviewer}`, 'SUSPENDED', now, session, { decision }, target)
        return station
    })
}
