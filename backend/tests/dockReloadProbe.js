// Fresh backend process against the isolated test database, never the live Atlas DB.
import assert from 'node:assert/strict'
import express from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import guardRoutes from '../routes/chargeGuard.js'

const [uri, stationId, expected] = process.argv.slice(2)
try {
  await mongoose.connect(uri)
  const app = express()
  app.use('/api/chargeguard', guardRoutes)
  const result = await request(app).get(`/api/chargeguard/admin/stations/${stationId}`)
    .set('Authorization', `Bearer ${process.env.CHARGEGUARD_ADMIN_TOKEN}`)
  assert.equal(result.status, 200)
  assert.equal(result.body.station.chargers[2].chargeGuard.state, expected)
  assert.equal(result.body.station.chargers[3].chargeGuard.state, 'ACTIVE')
  assert.ok(result.body.incidents.every((incident) => incident.chargingPointId === result.body.station.chargers[2]._id))
  assert.ok(result.body.events.length)
} finally {
  await mongoose.disconnect()
}
