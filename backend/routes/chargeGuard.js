import express from 'express'
import { createHash, timingSafeEqual } from 'node:crypto'
import mongoose from 'mongoose'
import ChargingIncident from '../models/ChargingIncident.js'
import IncidentEvent from '../models/IncidentEvent.js'
import ChargingStation from '../models/ChargingStation.js'
import { reportIssue, declareRepair, reactivateStation, expireProbation, healthState } from '../services/chargeGuard.js'

const router = express.Router()
const wrap = (action) => async (req, res) => {
    try { await action(req, res) } catch (error) {
        const status = error.code === 11000 ? 409 : error.statusCode || 500
        if (status === 500) console.error('ChargeGuard operation failed:', error.message)
        res.status(status).json({ message: error.code === 11000 ? 'This issue has already been reported.' : status === 500 ? 'ChargeGuard is temporarily unavailable. Please retry.' : error.message })
    }
}
function consumer(req, res, next) {
    if (!req.session?.consumerId) return res.status(401).json({ message: 'Please log in.' })
    next()
}
function admin(req, res, next) {
    const secret = process.env.CHARGEGUARD_ADMIN_TOKEN || ''
    const token = (req.get('authorization') || '').replace(/^Bearer /, '')
    const hash = (value) => createHash('sha256').update(value).digest()
    if (secret.length < 32 || !timingSafeEqual(hash(token), hash(secret))) return res.status(403).json({ message: 'Administrator authorization required.' })
    next()
}
// JSON-only writes reject cross-site HTML forms; no permissive cross-origin credential access.
router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (req.method === 'POST' && (!req.is('application/json') || req.get('sec-fetch-site') === 'cross-site')) return res.status(403).json({ message: 'Use a same-site JSON request.' })
    next()
})
router.post('/reports', consumer, wrap(async (req, res) => {
    const incident = await reportIssue(req.session.consumerId, req.body || {})
    res.status(201).json({ incident, message: 'Issue recorded. Reservations are paused and the host can review your report.' })
}))
router.get('/host/incidents', consumer, wrap(async (req, res) => {
    const owned = await ChargingStation.find({ hostId: req.session.consumerId }).select('_id')
    // Persist expiry lazily on host reads, without relying on a running background timer.
    const expired = await ChargingStation.find({ _id: { $in: owned.map((s) => s._id) }, 'chargeGuard.state': 'PROBATION', 'chargeGuard.probationUntil': { $lte: new Date() } }).select('_id')
    for (const { _id } of expired) await mongoose.connection.transaction(async (session) => {
        const station = await ChargingStation.findById(_id).session(session)
        if (station) await expireProbation(station, session)
    })
    const incidents = await ChargingIncident.find({ station: { $in: owned.map((s) => s._id) } })
        .sort({ resolvedAt: 1, reportedAt: -1 }).limit(200).populate('station', 'name chargeGuard')
    res.json({ incidents })
}))
router.post('/incidents/:id/repair', consumer, wrap(async (req, res) => {
    res.json({ incident: await declareRepair(req.session.consumerId, req.params.id, req.body || {}), message: 'Repair declaration saved. This is a host declaration, not independent hardware verification.' })
}))
router.get('/admin/review', admin, wrap(async (_req, res) => {
    const stations = await ChargingStation.find({ 'chargeGuard.state': 'SUSPENDED' }).select('name hostId chargeGuard').limit(200)
    res.json({ stations })
}))
router.get('/admin/stations/:id', admin, wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid station ID.' })
    const station = await ChargingStation.findById(req.params.id).select('name hostId chargeGuard')
    if (!station) return res.status(404).json({ message: 'Station not found.' })
    const incidents = await ChargingIncident.find({ station: station._id }).sort({ reportedAt: 1 })
    const events = await IncidentEvent.find({ station: station._id }).sort({ at: 1, _id: 1 })
    res.json({ station, incidents, events, healthState: healthState(station) })
}))
router.post('/admin/stations/:id/reactivate', admin, wrap(async (req, res) => {
    res.json({ station: await reactivateStation(req.params.id, req.body || {}) })
}))
export default router
