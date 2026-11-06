import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import mongoose from 'mongoose'
import { startFixture } from './uiFixture.js'
import Consumer from '../models/consumer.js'
import Booking from '../models/Booking.js'
import ChargingStation from '../models/ChargingStation.js'
import { pointCompatible } from '../../shared/chargingPoints.js'
import { importDemoStations, prepareDemoStations } from '../services/demoChargingPoints.js'
let fixture, host, driver, outsider, station, battery, bike, tomorrow
const point = (name, vehicleType = 'car') => ({ name, vehicleType, chargingMode: 'AC', powerOutputKW: 7.4, pricePerKWh: 12, totalPorts: 1, availability: 'available', connectorTypes: ['Type 2'], supportedVehicles: [] })
before(async () => {
  fixture = await startFixture()
  const base = `http://127.0.0.1:${fixture.port}`
  async function login(email) {
    const agent = request.agent(base)
    const result = await agent.post('/api/consumer/auth/login/request-otp').send({ email })
    assert.equal((await agent.post('/api/consumer/auth/login/verify-otp').send({ email, otp: result.body.otp })).status, 200)
    return agent
  }
  host = await login('host@example.test'); driver = await login('driver@example.test'); outsider = request.agent(base)
  const consumer = await Consumer.findOne({ email: 'driver@example.test' })
  consumer.batteries[0].maxAcChargingPowerKw = 7
  consumer.batteries.push({ name: 'Second EV', vehicleMake: 'Test', vehicleModel: 'EV', capacityKwh: 40, connectorTypes: ['Type 2'], maxAcChargingPowerKw: 7 })
  consumer.batteries.push({ name: 'Bike', vehicleType: 'bike', vehicleMake: 'TVS', vehicleModel: 'iQube', capacityKwh: 3.5, batteryVoltage: 48, connectorTypes: ['Type 2'], maxAcChargingPowerKw: 1 })
  await consumer.save(); battery = consumer.batteries[0]; bike = consumer.batteries[2]
  tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
}, { timeout: 120000 })
after(async () => { await fixture?.close() })
const book = (pointId, batteryId = battery.id, startTime = '10:00', endTime = '11:00') => driver.post('/api/bookings').send({ stationId: station._id, chargingPointId: pointId, batteryId, date: tomorrow, startTime, endTime, initialCharge: 20, finalCharge: 30 })
test('host creates one station with mixed points and Other network; validation rejects malformed inputs', async () => {
  const body = { name: 'Multi-point hub', address: 'Test street', city: 'Test city', state: 'Test state', pincode: '575001', stationType: 'private_hosted', latitude: 12.9, longitude: 74.85, openingTime: '06:00', closingTime: '23:00', chargingNetwork: 'Other', otherNetworkName: 'Community Network', chargingPoints: [point('Car A'), point('Car B'), point('Bike A', 'bike')] }
  assert.equal((await outsider.post('/api/charging-stations').send(body)).status, 401)
  assert.equal((await host.post('/api/charging-stations').send({ ...body, otherNetworkName: '' })).status, 400)
  const result = await host.post('/api/charging-stations').send(body)
  assert.equal(result.status, 201, JSON.stringify(result.body)); station = result.body.station
  assert.equal(station.chargers.length, 3); assert.equal(new Set(station.chargers.map((p) => p._id)).size, 3)
  assert.equal(station.otherNetworkName, 'Community Network')
  assert.equal(await ChargingStation.countDocuments({ _id: station._id }), 1)
})
test('compatibility enforces category, connectors, models and manual battery restrictions', async () => {
  assert.equal((await book(station.chargers[2]._id)).status, 400)
  assert.equal((await book(station.chargers[0]._id, bike.id)).status, 400)
  assert.equal((await book(new mongoose.Types.ObjectId().toString())).status, 404)
  assert.equal((await book(undefined)).status, 400)
  const restricted = { ...point('Bike', 'bike'), supportedVehicles: [{ make: 'TVS', model: 'iQube', capacityKwh: 3.5, batteryVoltage: 48 }] }
  assert.equal(pointCompatible(restricted, bike), true)
  assert.equal(pointCompatible(restricted, { ...bike.toObject(), batteryVoltage: 72 }), false)
  assert.equal(pointCompatible(restricted, { ...bike.toObject(), vehicleModel: 'Rizta' }), false)
  assert.equal(pointCompatible({ ...restricted, connectorTypes: ['Other'] }, { ...bike.toObject(), connectorTypes: ['Other'] }), false)
})
test('concurrent reservations on the same point produce only one booking', async () => {
  const consumer = await Consumer.findOne({ email: 'driver@example.test' })
  const results = await Promise.all([book(station.chargers[0]._id), book(station.chargers[0]._id, consumer.batteries[1].id)])
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409])
  const saved = await Booking.findOne({ station: station._id })
  assert.equal(String(saved.chargingPointId), station.chargers[0]._id)
  assert.equal(saved.chargingPointName, 'Car A'); assert.equal(saved.pricePerKWh, 12)
})
test('different points have independent availability; same battery cannot overlap across points', async () => {
  const existing = await Booking.findOne({ station: station._id })
  const consumer = await Consumer.findOne({ email: 'driver@example.test' })
  const freeBattery = consumer.batteries.find((b) => b.vehicleType === 'car' && String(b._id) !== String(existing.batteryId))
  assert.equal((await book(station.chargers[1]._id, String(existing.batteryId))).status, 409)
  assert.equal((await book(station.chargers[1]._id, freeBattery.id)).status, 201)
  assert.equal((await book(station.chargers[2]._id, bike.id)).status, 201)
  const listing = (await driver.get('/api/charging-stations')).body.stations.find((s) => s._id === station._id)
  assert.equal(listing.chargers.length, 3)
  assert.equal(listing.chargers[0].timeSlots.some((s) => s.startTime < '11:00' && s.endTime > '10:00' && s.date.slice(0, 10) === new Date(`${tomorrow}T00:00:00`).toISOString().slice(0, 10)), false)
})
test('only owner can manage points; booked point deletion and price edits are blocked', async () => {
  const body = { chargingNetwork: 'Statiq', chargingPoints: station.chargers }
  assert.equal((await driver.put(`/api/charging-stations/${station._id}/points`).send(body)).status, 404)
  assert.equal((await host.put(`/api/charging-stations/${station._id}/points`).send({ ...body, chargingPoints: station.chargers.slice(1) })).status, 409)
  const changed = station.chargers.map((p, i) => i === 0 ? { ...p, pricePerKWh: 99 } : p)
  assert.equal((await host.put(`/api/charging-stations/${station._id}/points`).send({ ...body, chargingPoints: changed })).status, 409)
  const offline = station.chargers.map((p, i) => i === 0 ? { ...p, availability: 'offline' } : p)
  const result = await host.put(`/api/charging-stations/${station._id}/points`).send({ ...body, chargingPoints: offline })
  assert.equal(result.status, 200, JSON.stringify(result.body))
  assert.equal((await book(station.chargers[0]._id, battery.id, '13:00', '14:00')).status, 409)
})
test('cancelling a point booking leaves other reservations and station slots intact', async () => {
  const before = await ChargingStation.findById(station._id)
  const b = await Booking.findOne({ station: station._id, chargingPointId: station.chargers[1]._id })
  assert.equal((await driver.delete(`/api/bookings/${b._id}`)).status, 200)
  assert.equal(await Booking.countDocuments({ station: station._id, status: 'confirmed' }), 2)
  assert.deepEqual((await ChargingStation.findById(station._id)).timeSlots.toObject(), before.timeSlots.toObject())
  assert.equal((await book(station.chargers[1]._id, String(b.batteryId))).status, 201)
})
test('point IDs survive edit and unused points can be added and removed', async () => {
  const current = (await ChargingStation.findById(station._id)).toObject()
  const result = await host.put(`/api/charging-stations/${station._id}/points`).send({ chargingPoints: [...current.chargers, point('Spare')], chargingNetwork: 'HPCL' })
  assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(result.body.station.chargers[0]._id, station.chargers[0]._id)
  assert.equal((await host.put(`/api/charging-stations/${station._id}/points`).send({ chargingPoints: current.chargers, chargingNetwork: 'HPCL' })).status, 200)
})
test('legacy station-wide bookings still block every point after enabling point reservations', async () => {
  await Booking.create({ station: station._id, consumerId: String(battery.parent()._id), batteryId: battery._id, initialCharge: 20, finalCharge: 30, date: tomorrow, startTime: '16:00', endTime: '17:00', startAt: new Date(`${tomorrow}T16:00:00`), endAt: new Date(`${tomorrow}T17:00:00`), durationMinutes: 60 })
  assert.equal((await book(station.chargers[1]._id, battery.id, '16:00', '17:00')).status, 409)
  assert.equal((await book(station.chargers[2]._id, bike.id, '16:00', '17:00')).status, 409)
})
test('15-station import is repeatable, preserves coordinates and unrelated records, and requires a complete list', async () => {
  // Synthetic isolated fixtures, not a replacement for the user-provided Mangalore list.
  const rows = Array.from({ length: 15 }, (_, i) => ({ stationCode: `MLR-DEMO-${String(i + 1).padStart(3, '0')}`, name: `Fixture ${i}`, area: 'Test area', address: 'Test address', coordinates: [74.85 + i / 10000, 12.9] }))
  assert.throws(() => prepareDemoStations(rows.slice(1)), /exactly 15/)
  const userBefore = (await ChargingStation.findById(station._id)).toObject()
  await importDemoStations(rows, mongoose.connection)
  const before = await ChargingStation.find({ stationCode: /^MLR-DEMO-/ }).sort({ stationCode: 1 }).lean()
  await importDemoStations(rows, mongoose.connection)
  const after = await ChargingStation.find({ stationCode: /^MLR-DEMO-/ }).sort({ stationCode: 1 }).lean()
  assert.equal(after.length, 15)
  assert.deepEqual(after.map((s) => s.chargers.map((p) => String(p._id))), before.map((s) => s.chargers.map((p) => String(p._id))))
  assert.deepEqual(after.map((s) => s.location.coordinates), rows.map((s) => s.coordinates))
  assert.ok(after.every((s) => s.chargers.some((p) => p.vehicleType === 'bike') && s.chargers.some((p) => p.vehicleType === 'car')))
  assert.equal(new Set(after.map((s) => s.chargers.length)).size, 3)
  assert.deepEqual((await ChargingStation.findById(station._id)).toObject(), userBefore)
  await assert.rejects(importDemoStations(rows.map((r, i) => i ? r : { ...r, coordinates: [74, 12] }), mongoose.connection), /Coordinates differ/)
})

test('amenities-only edits validate, normalize and preserve legacy station settings', async () => {
  const legacy = await ChargingStation.findOne({ stationCode: 'UI-TEST' }).lean()
  const url = '/api/charging-stations/' + legacy._id + '/points'
  assert.equal((await driver.put(url).send({ amenities: ['parking'] })).status, 404)
  assert.equal((await host.put(url).send({ amenities: ['invented'] })).status, 400)
  const saved = await host.put(url).send({ amenities: [' Parking ', 'Restroom', 'parking', 'Wi-Fi'] })
  assert.equal(saved.status, 200)
  assert.deepEqual(saved.body.station.amenities, ['parking', 'washroom', 'wifi'])
  const current = await ChargingStation.findById(legacy._id).lean()
  assert.equal(current.pointBookingEnabled, legacy.pointBookingEnabled)
  assert.deepEqual(current.chargers, legacy.chargers)
  assert.deepEqual(current.pricing, legacy.pricing)
  assert.deepEqual(current.timeSlots, legacy.timeSlots)
  const cleared = await host.put(url).send({ amenities: [] })
  assert.equal(cleared.status, 200)
  assert.deepEqual(cleared.body.station.amenities, [])
})
