// Isolated browser-test fixture. Never mounted by the production server.
import express from 'express'
import { fileURLToPath } from 'node:url'
import session from 'express-session'
import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import Consumer from '../models/consumer.js'
import ChargingStation from '../models/ChargingStation.js'
import Booking from '../models/Booking.js'
import ChargingIncident from '../models/ChargingIncident.js'
import IncidentEvent from '../models/IncidentEvent.js'
import authRoutes from '../routes/consumerAuth.js'
import bookingRoutes from '../routes/bookings.js'
import stationRoutes from '../routes/chargingStations.js'
import guardRoutes from '../routes/chargeGuard.js'

export async function startFixture() {
  const mongo = await MongoMemoryReplSet.create({ binary: { downloadDir: fileURLToPath(new URL('../node_modules/.cache/mongodb-memory-server', import.meta.url)) }, replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60000 }] })
  await mongoose.connect(mongo.getUri())
  await Promise.all([ChargingIncident.init(), IncidentEvent.init()])
  const owner = await Consumer.create({ firstName: 'Test', lastName: 'Host', email: 'host@example.test' })
  const driver = await Consumer.create({ firstName: 'Test', lastName: 'Driver', email: 'driver@example.test', batteries: [{ name: 'Test EV', vehicleMake: 'Test', vehicleModel: 'EV', capacityKwh: 40, connectorTypes: ['type2'] }] })
  const station = await ChargingStation.create({ name: 'ChargeGuard Test Station', stationCode: 'UI-TEST', stationType: 'private_hosted', address: 'Test address', hostId: owner._id, location: { type: 'Point', coordinates: [77, 12] }, chargers: [{ chargerType: 'AC', chargingMode: 'AC', connectorTypes: ['type2'], powerOutputKW: 7 }], pricing: { pricingModel: 'per_kwh' }, isDemo: false })
  const base = { station: station._id, consumerId: driver.id, batteryId: driver.batteries[0]._id, initialCharge: 20, finalCharge: 30, date: new Date().toISOString().slice(0, 10), startTime: '10:00', endTime: '11:00', durationMinutes: 60 }
  await Booking.create({ ...base, startAt: new Date(Date.now() - 1800000), endAt: new Date(Date.now() + 1800000) })
  await Booking.create({ ...base, startAt: new Date(Date.now() - 7200000), endAt: new Date(Date.now() - 3600000) })
  const app = express(); app.use(express.json()); app.use(session({ secret: 'isolated-browser-fixture-session-secret', resave: false, saveUninitialized: false }))
  app.use('/api/consumer/auth', authRoutes); app.use('/api/bookings', bookingRoutes); app.use('/api/charging-stations', stationRoutes); app.use('/api/chargeguard', guardRoutes)
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  return { port: server.address().port, close: async () => { await new Promise((resolve) => server.close(resolve)); await mongoose.disconnect(); await mongo.stop() } }
}
