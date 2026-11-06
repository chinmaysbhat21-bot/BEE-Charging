import { before, after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import mongoose from 'mongoose'
import { startFixture } from './uiFixture.js'
import Consumer from '../models/consumer.js'
import Station from '../models/ChargingStation.js'
import Booking from '../models/Booking.js'
import Wallet from '../models/Wallet.js'
import Ledger from '../models/WalletTransaction.js'
import Incident from '../models/ChargingIncident.js'
import { bookingAmount } from '../services/wallet.js'
let fixture, driver, host, base, station, user, owner, tomorrow
before(async () => {
  fixture = await startFixture({ fundWallet: false }); base = `http://127.0.0.1:${fixture.port}`
  async function login(email) {
    const agent = request.agent(base)
    const otp = await agent.post('/api/consumer/auth/login/request-otp').send({ email })
    assert.equal((await agent.post('/api/consumer/auth/login/verify-otp').send({ email, otp: otp.body.otp })).status, 200)
    return agent
  }
  driver = await login('driver@example.test'); host = await login('host@example.test')
  user = await Consumer.findOne({ email: 'driver@example.test' }); owner = await Consumer.findOne({ email: 'host@example.test' })
  user.batteries[0].maxAcChargingPowerKw = 7; user.batteries.push(user.batteries[0].toObject()); user.batteries[1]._id = new mongoose.Types.ObjectId(); await user.save()
  station = await Station.findOne({ stationCode: 'UI-TEST' })
  station.pointBookingEnabled = true
  station.chargers[0].name = 'Dock 1'; station.chargers[0].pricePerKWh = 10
  const second = station.chargers[0].toObject(); delete second._id
  station.chargers.push({ ...second, name: 'Dock 2' }); await station.save()
  const date = new Date(Date.now() + 86400000)
  tomorrow = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}, { timeout: 120000 })
after(async () => fixture?.close())
beforeEach(async () => {
  // Test-only fixture reset using raw collections; application ledger APIs prohibit mutations.
  await Ledger.collection.deleteMany({}); await Wallet.deleteMany({}); await Booking.deleteMany({}); await Incident.deleteMany({})
  await Station.updateOne({ _id: station._id }, { $set: { 'chargers.0.chargeGuard.state': 'ACTIVE', 'chargers.1.chargeGuard.state': 'ACTIVE' } })
})
const recharge = (amount = '100', key = 'wallet-test-recharge') => driver.post('/api/wallet/recharge').send({ amount, idempotencyKey: key })
const balance = async role => (await (role === 'host' ? host : driver).get(`/api/wallet?role=${role || 'consumer'}`)).body.wallet.balanceInPaise
const book = (index = 0, key = 'wallet-booking-request', extra = {}) => driver.post('/api/bookings').set('Idempotency-Key', key).send({ stationId: station.id, chargingPointId: station.chargers[index].id, batteryId: user.batteries[index]._id, date: tomorrow, startTime: '10:00', endTime: '11:00', initialCharge: 20, finalCharge: 30, ...extra })
const token = 'test-charger-event-token-at-least-32-characters'
process.env.CHARGING_EVENT_TOKEN = token
const complete = (id, successful = true) => request(base).post(`/api/wallet/bookings/${id}/complete`).set('Authorization', 'Bearer ' + token).send({ successful })
async function ended(id) { await Booking.updateOne({ _id: id }, { $set: { startAt: new Date(Date.now() - 7200000), endAt: new Date(Date.now() - 3600000) } }) }

test('consumer and host balances are independent, private and initially zero', async () => {
  const consumerWallet = (await driver.get('/api/wallet')).body.wallet
  const hostWallet = (await driver.get('/api/wallet?role=host')).body.wallet
  assert.notEqual(consumerWallet._id, hostWallet._id); assert.equal(consumerWallet.balanceInPaise, 0); assert.equal(hostWallet.balanceInPaise, 0)
  assert.equal((await request(base).get('/api/wallet')).status, 401)
  assert.equal((await driver.get('/api/wallet?role=admin')).status, 400)
  await recharge()
  assert.equal(await balance('host'), 0)
  assert.equal((await host.get(`/api/wallet?userId=${user.id}`)).body.transactions.length, 0)
})
test('demo recharge validates decimals, exactly-once replay and concurrent duplicate credits', async () => {
  await driver.get('/api/wallet')
  const results = await Promise.all([recharge('100.25'), recharge('100.25')])
  assert.ok(results.every(result => [200, 409].includes(result.status)))
  assert.equal((await recharge('100.25')).status, 200)
  assert.equal(await balance(), 10025); assert.equal(await Ledger.countDocuments(), 1)
  assert.equal((await recharge('200')).status, 409)
  for (const amount of ['-1', '0', '1.001', '10001', '1e3']) assert.equal((await recharge(amount, 'invalid-amount-key')).status, 400)
  assert.equal((await driver.post('/api/wallet/recharge').send({ amount: '100' })).status, 400)
  assert.match((await Ledger.findOne()).description, /simulated funds/)
})
test('insufficient balance or failed validation rolls back booking and debit', async () => {
  assert.equal((await book()).status, 402); assert.equal(await Booking.countDocuments(), 0); assert.equal(await Ledger.countDocuments(), 0)
  await recharge()
  assert.equal((await book(0, 'invalid-dock-key', { chargingPointId: String(new mongoose.Types.ObjectId()) })).status, 404)
  assert.equal((await book(0, 'changed-price-key', { expectedAmountInPaise: 1 })).status, 409)
  assert.equal(await balance(), 10000); assert.equal(await Ledger.countDocuments({ type: 'PAYMENT' }), 0)
})
test('server quote, booking payment and idempotent booking replay use exact paise', async () => {
  await recharge()
  const quote = await driver.post('/api/wallet/quote').send({ stationId: station.id, chargingPointId: station.chargers[0].id, batteryId: user.batteries[0]._id, initialCharge: 20, finalCharge: 30, durationMinutes: 60 })
  assert.equal(quote.body.amountInPaise, 4000)
  const first = await book(); assert.equal(first.status, 201, JSON.stringify(first.body))
  const again = await book(); assert.equal(again.body.booking._id, first.body.booking._id)
  assert.equal(await balance(), 10000); assert.equal(await Ledger.countDocuments({ type: 'PAYMENT' }), 0); assert.equal(await balance('host'), 0)
  assert.equal((await book(1)).status, 409)
  assert.equal(bookingAmount({ pricing: { pricingModel: 'per_kwh_plus_time', pricePerKWh: 12.34, pricePerMinute: 0.05, sessionFee: 1.01 } }, null, { capacityKwh: 3.5 }, 20, 30, 30), 683)
})
test('concurrent different bookings cannot spend the same balance', async () => {
  await recharge('50')
  const result = await Promise.all([book(0, 'parallel-booking-one'), book(1, 'parallel-booking-two')])
  assert.deepEqual(result.map(r => r.status).sort(), [201, 402]); assert.equal(await balance(), 5000); assert.equal(await Booking.countDocuments(), 1)
})
test('eligible cancellation releases funds once and preserves the one-hour deadline', async () => {
  await recharge(); const result = await book(); const id = result.body.booking._id
  assert.equal((await driver.delete(`/api/bookings/${id}`)).status, 200)
  assert.equal((await driver.delete(`/api/bookings/${id}`)).status, 404)
  assert.equal(await balance(), 10000); assert.equal(await Ledger.countDocuments({ type: 'REFUND' }), 0)
  assert.equal((await complete(id)).status, 409)
  const second = await book(1, 'refund-deadline-test'); await ended(second.body.booking._id)
  assert.equal((await driver.delete(`/api/bookings/${second.body.booking._id}`)).status, 400)
  assert.equal(await balance(), 10000)
})
test('only charger integration can settle successful sessions; exactly-once host earnings and accurate analytics', async () => {
  await recharge(); const result = await book(); const id = result.body.booking._id
  assert.equal((await complete(id)).status, 409)
  await ended(id)
  assert.equal((await host.post(`/api/wallet/bookings/${id}/complete`).send({ successful: true })).status, 403)
  const completed = await Promise.all([complete(id), complete(id)])
  assert.ok(completed.every(r => r.status === 200)); assert.equal(await balance('host'), 4000); assert.equal(await balance(), 6000); assert.equal(await Ledger.countDocuments({ type: 'PAYMENT' }), 1)
  const earnings = await Ledger.findOne({ type: 'EARNING' }); assert.equal(String(earnings.relatedTransactionId), String((await Booking.findById(id)).payment.transactionId))
  for (const range of ['7', '30', '6m']) {
    const totals = (await host.get(`/api/wallet/earnings?range=${range}`)).body
    assert.equal(totals.totalInPaise, 4000); assert.equal(totals.todayInPaise, 4000); assert.equal(totals.monthInPaise, 4000); assert.equal(totals.completedSessions, 1)
    assert.equal(totals.series.reduce((sum, row) => sum + row.amountInPaise, 0), 4000)
  }
  assert.equal((await host.get('/api/wallet?role=host')).body.transactions[0].bookingId, id)
})
test('ChargeGuard failed sessions cannot earn; late report reverses earnings without deleting history', async () => {
  await recharge(); const result = await book(); const id = result.body.booking._id; await ended(id)
  assert.equal((await complete(id)).status, 200)
  const report = await driver.post('/api/chargeguard/reports').send({ bookingId: id, category: 'charger_malfunction' })
  assert.equal(report.status, 201); assert.equal(await balance('host'), 0)
  assert.equal((await complete(id)).status, 409)
  assert.equal(await Ledger.countDocuments({ type: 'EARNING' }), 1); assert.equal(await Ledger.countDocuments({ type: 'REVERSAL' }), 1)
  assert.equal((await host.get('/api/wallet/earnings')).body.completedSessions, 0)
  assert.equal((await Booking.findById(id)).sessionOutcome, 'failed')
  await driver.post('/api/chargeguard/reports').send({ bookingId: id, category: 'power_unavailable' })
  assert.equal(await Ledger.countDocuments({ type: 'REVERSAL' }), 1)
})
test('ledger mutation is blocked and state survives database reconnect', async () => {
  await recharge('123.45')
  const entry = await Ledger.findOne()
  entry.amountInPaise = 1; await assert.rejects(entry.save(), /immutable/)
  await assert.rejects(Ledger.updateOne({}, { $set: { amountInPaise: 1 } }), /immutable/)
  await assert.rejects(Ledger.deleteMany({}), /immutable/)
  const uri = mongoose.connection.client.s.url
  await mongoose.disconnect(); await mongoose.connect(uri)
  assert.equal(await balance(), 12345); assert.equal((await Ledger.findOne()).amountInPaise, 12345)
})

test('a reported failed paid session never earns a host credit', async () => {
  await recharge(); const result = await book(); const id = result.body.booking._id; await ended(id)
  assert.equal((await driver.post('/api/chargeguard/reports').send({ bookingId: id, category: 'power_unavailable' })).status, 201)
  assert.equal((await complete(id)).status, 409)
  assert.equal(await Ledger.countDocuments({ type: 'EARNING' }), 0)
  assert.equal(await balance('host'), 0)
  assert.equal((await driver.get('/api/wallet')).body.transactions.filter(t => t.type === 'PAYMENT').length, 0)
})
