import { before, after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import ChargingStation from '../models/ChargingStation.js'
import Booking from '../models/Booking.js'
import Consumer from '../models/consumer.js'
import ChargingIncident from '../models/ChargingIncident.js'
import IncidentEvent from '../models/IncidentEvent.js'
import guardRoutes from '../routes/chargeGuard.js'
import bookingRoutes from '../routes/bookings.js'
import stationRoutes from '../routes/chargingStations.js'
import { healthState } from '../services/chargeGuard.js'

let mongo, app, station, booking, consumer
const owner = new mongoose.Types.ObjectId().toString()
const user = new mongoose.Types.ObjectId().toString()
const outsider = new mongoose.Types.ObjectId().toString()
const adminToken = 'test-only-admin-secret-with-more-than-32-characters'
const repair = { problem: 'Loose connection', fix: 'Replaced damaged connection and tested charging', tested: true }
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60000 }] })
  await mongoose.connect(mongo.getUri())
  await Promise.all([ChargingStation.init(), Booking.init(), Consumer.init(), ChargingIncident.init(), IncidentEvent.init()])
  process.env.CHARGEGUARD_ADMIN_TOKEN = adminToken
  app = express(); app.use(express.json())
  // Test-only identity injection; production uses express-session, never this header.
  app.use((req, _res, next) => { req.session = { consumerId: req.get('x-test-user') }; next() })
  app.use('/api/chargeguard', guardRoutes); app.use('/api/bookings', bookingRoutes); app.use('/api/charging-stations', stationRoutes)
}, { timeout: 240000 })
after(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop() })
beforeEach(async () => {
  await mongoose.connection.db.dropDatabase()
  await ChargingIncident.createIndexes()
  consumer = await Consumer.create({ _id: user, firstName: 'Test', lastName: 'Driver', batteries: [{ name: 'EV', vehicleMake: 'Test', vehicleModel: 'EV', capacityKwh: 40, connectorTypes: ['type2'], maxAcChargingPowerKw: 7 }] })
  station = await ChargingStation.create({ name: 'Test station', stationCode: 'TEST', stationType: 'private_hosted', address: 'Test address', hostId: owner,
    location: { type: 'Point', coordinates: [77, 12] }, chargers: [{ chargerType: 'AC', chargingMode: 'AC', connectorTypes: ['type2'], powerOutputKW: 7 }], pricing: { pricingModel: 'per_kwh', pricePerKWh: 10 } })
  booking = await makeBooking()
})
async function makeBooking(overrides = {}) {
  return Booking.create({ station: station._id, consumerId: user, batteryId: consumer.batteries[0]._id, initialCharge: 20, finalCharge: 30, date: '2026-11-05', startTime: '10:00', endTime: '11:00', startAt: new Date(Date.now() - 3600000), endAt: new Date(Date.now() + 3600000), durationMinutes: 60, ...overrides })
}
const post = (path, body, actor = user) => request(app).post(`/api/chargeguard${path}`).set('x-test-user', actor).send(body)
const report = (body = {}, actor = user) => post('/reports', { bookingId: String(booking._id), category: 'charger_malfunction', description: 'Charging failed', ...body }, actor)
const getStation = () => ChargingStation.findById(station._id)
async function repaired() {
  const result = await report(); assert.equal(result.status, 201)
  const response = await post(`/incidents/${result.body.incident._id}/repair`, repair, owner)
  assert.equal(response.status, 200, JSON.stringify(response.body))
  return result.body.incident._id
}
async function suspended() {
  await repaired()
  const second = await makeBooking({ startAt: new Date() })
  const result = await report({ bookingId: String(second._id) })
  assert.equal(result.status, 201)
  assert.equal((await getStation()).chargeGuard.state, 'SUSPENDED')
  return result.body.incident._id
}
test('valid report is permanent, pauses station, preserves status and booking, and notifies only owner', async () => {
  const result = await report(); assert.equal(result.status, 201)
  assert.equal((await getStation()).chargeGuard.state, 'PAUSED')
  assert.equal((await getStation()).status, 'available')
  assert.equal((await Booking.findById(booking._id)).status, 'confirmed')
  assert.ok(result.body.incident.reportedAt)
  assert.equal(await IncidentEvent.countDocuments({ type: 'REPORTED' }), 1)
  const host = await request(app).get('/api/chargeguard/host/incidents').set('x-test-user', owner)
  assert.equal(host.body.incidents[0].booking, String(booking._id))
  assert.equal(host.body.incidents[0].station.name, station.name)
  const other = await request(app).get('/api/chargeguard/host/incidents').set('x-test-user', outsider)
  assert.deepEqual(other.body.incidents, [])
  const mine = await request(app).get('/api/bookings/my').set('x-test-user', user)
  assert.equal(mine.body.bookings[0].stationHealth, 'PAUSED')
})
test('unauthenticated, unrelated, malformed and nonexistent bookings are rejected', async () => {
  assert.equal((await request(app).post('/api/chargeguard/reports').send({})).status, 401)
  assert.equal((await report({}, outsider)).status, 404)
  assert.equal((await report({ bookingId: 'bad' })).status, 400)
  assert.equal((await report({ bookingId: String(new mongoose.Types.ObjectId()) })).status, 404)
  assert.equal(await ChargingIncident.countDocuments(), 0)
})
test('future, cancelled and expired bookings cannot be reported', async () => {
  for (const override of [{ startAt: new Date(Date.now() + 60000) }, { status: 'cancelled' }, { endAt: new Date(Date.now() - 25 * 3600000) }]) {
    const b = await makeBooking(override)
    assert.equal((await report({ bookingId: String(b._id) })).status, 409)
  }
})
test('category, explanation and same-site JSON validation', async () => {
  assert.equal((await report({ category: 'invalid' })).status, 400)
  assert.equal((await report({ description: {} })).status, 400)
  assert.equal((await report({ description: 'a'.repeat(2001) })).status, 400)
  assert.equal((await request(app).post('/api/chargeguard/reports').set('sec-fetch-site', 'cross-site').send({})).status, 403)
  const result = await report({ stationId: String(new mongoose.Types.ObjectId()), reportedAt: '2000-01-01' })
  assert.equal(result.body.incident.station, String(station._id))
  assert.ok(new Date(result.body.incident.reportedAt).getFullYear() > 2000)
})
test('duplicate reports including concurrent submissions are rejected atomically', async () => {
  const results = await Promise.all([report(), report(), report()])
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409])
  assert.equal(await ChargingIncident.countDocuments(), 1)
  assert.equal(await IncidentEvent.countDocuments(), 1)
})
test('paused and suspended stations reject real booking API calls', async () => {
  await report()
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const body = { stationId: station.id, batteryId: consumer.batteries[0].id, date: tomorrow, startTime: '10:00', endTime: '11:00', initialCharge: 20, finalCharge: 30 }
  for (const state of ['PAUSED', 'SUSPENDED']) {
    await ChargingStation.updateOne({ _id: station._id }, { $set: { 'chargeGuard.state': state } })
    const result = await request(app).post('/api/bookings').set('x-test-user', user).send(body)
    assert.equal(result.status, 409); assert.match(result.body.message, /ChargeGuard/)
  }
})
test('only owner can repair; post-repair test and descriptions are mandatory', async () => {
  const result = await report(); const path = `/incidents/${result.body.incident._id}/repair`
  assert.equal((await post(path, repair, outsider)).status, 403)
  assert.equal((await post(path, { ...repair, tested: false }, owner)).status, 400)
  assert.equal((await post(path, { ...repair, fix: ' ' }, owner)).status, 400)
  assert.equal((await getStation()).chargeGuard.state, 'PAUSED')
})
test('repair stores declaration and exact 24-hour probation; duplicates cannot extend it', async () => {
  const id = await repaired()
  const s = await getStation(); assert.equal(s.chargeGuard.state, 'PROBATION')
  assert.equal(s.chargeGuard.probationUntil - s.chargeGuard.repairAt, 86400000)
  assert.equal((await ChargingIncident.findById(id)).repair.tested, true)
  assert.equal(await IncidentEvent.countDocuments({ type: 'REPAIR_DECLARED' }), 1)
  assert.equal((await post(`/incidents/${id}/repair`, repair, owner)).status, 409)
})
test('probation expiry uses stored server time and appends history on next host read', async () => {
  await repaired()
  await ChargingStation.updateOne({ _id: station._id }, { $set: { 'chargeGuard.probationUntil': new Date(Date.now() - 1) } })
  assert.equal(healthState(await getStation()), 'ACTIVE')
  await request(app).get('/api/chargeguard/host/incidents').set('x-test-user', owner)
  assert.equal((await getStation()).chargeGuard.state, 'ACTIVE')
  assert.equal(await IncidentEvent.countDocuments({ type: 'PROBATION_EXPIRED' }), 1)
})
test('independent same-category post-repair failure suspends and blocks host reactivation', async () => {
  const id = await suspended()
  assert.equal((await ChargingIncident.findById(id)).reviewRequired, true)
  assert.equal((await getStation()).chargeGuard.suspensionCount, 1)
  assert.equal((await post(`/incidents/${id}/repair`, repair, owner)).status, 409)
  assert.equal(await ChargingIncident.countDocuments(), 2)
})
test('same booking and late pre-repair reports cannot count as independent repeat failures', async () => {
  await repaired()
  assert.equal((await report()).status, 409)
  const old = await makeBooking()
  assert.equal((await report({ bookingId: old.id })).status, 201)
  assert.equal((await getStation()).chargeGuard.state, 'PAUSED')
})
test('different issue category does not automatically suspend', async () => {
  await repaired(); const second = await makeBooking({ startAt: new Date() })
  assert.equal((await report({ bookingId: second.id, category: 'power_unavailable' })).status, 201)
  assert.equal((await getStation()).chargeGuard.state, 'PAUSED')
})
test('repeat after probation expiry pauses without automatic suspension', async () => {
  const id = await repaired()
  await ChargingIncident.updateOne({ _id: id }, { $set: { 'repair.probationUntil': new Date(Date.now() - 1) } })
  await ChargingStation.updateOne({ _id: station._id }, { $set: { 'chargeGuard.probationUntil': new Date(Date.now() - 1) } })
  const second = await makeBooking({ startAt: new Date() })
  assert.equal((await report({ bookingId: second.id })).status, 201)
  assert.equal((await getStation()).chargeGuard.state, 'PAUSED')
})
test('all unresolved issues must be repaired before probation', async () => {
  const first = await report(); const second = await report({ category: 'power_unavailable' })
  await post(`/incidents/${first.body.incident._id}/repair`, repair, owner)
  assert.equal((await getStation()).chargeGuard.state, 'PAUSED')
  await post(`/incidents/${second.body.incident._id}/repair`, repair, owner)
  assert.equal((await getStation()).chargeGuard.state, 'PROBATION')
})
test('administrator review is protected; authorized reactivation preserves suspension history', async () => {
  await suspended()
  const path = `/api/chargeguard/admin/stations/${station.id}/reactivate`
  assert.equal((await request(app).get('/api/chargeguard/admin/review').set('x-test-user', owner)).status, 403)
  assert.equal((await request(app).post(path).send({ decision: 'ok', reviewer: 'user' })).status, 403)
  const review = await request(app).get(`/api/chargeguard/admin/stations/${station.id}`).auth(adminToken, { type: 'bearer' })
  assert.equal(review.body.incidents.length, 2); assert.equal(review.body.events.length, 3)
  assert.equal((await request(app).post(path).auth(adminToken, { type: 'bearer' }).send({ decision: 'Inspected repair evidence and approved reopening', reviewer: 'operations-1' })).status, 200)
  const s = await getStation(); assert.equal(s.chargeGuard.state, 'ACTIVE'); assert.equal(s.chargeGuard.suspensionCount, 1); assert.ok(s.chargeGuard.suspensionReason)
  assert.equal(await IncidentEvent.countDocuments({ type: 'ADMIN_REACTIVATED' }), 1)
  assert.equal(await ChargingIncident.countDocuments(), 2)
})
test('legacy station defaults and bookings work without migration; protected history cannot be deleted', async () => {
  await ChargingStation.collection.updateOne({ _id: station._id }, { $unset: { chargeGuard: '' } })
  assert.equal(healthState(await getStation()), 'ACTIVE')
  assert.equal((await request(app).get('/api/bookings/my').set('x-test-user', user)).body.bookings[0].chargeGuardReportEligible, true)
  assert.equal((await report()).status, 201)
  assert.equal((await request(app).delete(`/api/charging-stations/${station.id}`).set('x-test-user', owner)).status, 409)
  await assert.rejects(IncidentEvent.deleteMany({}), /append-only/)
  await assert.rejects(IncidentEvent.updateOne({}, { $set: { actor: 'changed' } }), /append-only/)
})

async function futureReservation() {
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  await ChargingStation.updateOne({ _id: station._id }, { $set: { timeSlots: [{ date: new Date(`${date}T00:00:00`), startTime: '10:00', endTime: '12:00', status: 'available' }] } })
  return { stationId: station.id, batteryId: consumer.batteries[0].id, date, startTime: '10:00', endTime: '11:00', initialCharge: 20, finalCharge: 30 }
}
test('legacy station still accepts a real reservation and cancellation', async () => {
  const body = await futureReservation()
  await ChargingStation.collection.updateOne({ _id: station._id }, { $unset: { chargeGuard: '' } })
  const result = await request(app).post('/api/bookings').set('x-test-user', user).send(body)
  assert.equal(result.status, 201, JSON.stringify(result.body))
  const cancellation = await request(app).delete(`/api/bookings/${result.body.booking._id}`).set('x-test-user', user)
  assert.equal(cancellation.status, 200)
  assert.equal((await Booking.findById(result.body.booking._id)).status, 'cancelled')
})
test('concurrent report and reservation serialize; reservations after accepted report are rejected', async () => {
  const body = await futureReservation()
  const [reported, reserved] = await Promise.all([report(), request(app).post('/api/bookings').set('x-test-user', user).send(body)])
  assert.equal(reported.status, 201)
  assert.ok([201, 409].includes(reserved.status), JSON.stringify(reserved.body))
  assert.equal((await getStation()).chargeGuard.state, 'PAUSED')
  assert.equal((await request(app).post('/api/bookings').set('x-test-user', user).send(body)).status, 409)
})
test('missing or short administrator credentials fail closed', async () => {
  for (const token of ['', 'short']) {
    process.env.CHARGEGUARD_ADMIN_TOKEN = token
    assert.equal((await request(app).get('/api/chargeguard/admin/review').auth(token || 'empty', { type: 'bearer' })).status, 403)
  }
  process.env.CHARGEGUARD_ADMIN_TOKEN = adminToken
})
