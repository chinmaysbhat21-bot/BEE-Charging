import { createHash, timingSafeEqual } from 'node:crypto'
import express from 'express'
import mongoose from 'mongoose'
import Ledger from '../models/WalletTransaction.js'
import Booking from '../models/Booking.js'
import Station from '../models/ChargingStation.js'
import Consumer from '../models/consumer.js'
import Incident from '../models/ChargingIncident.js'
import { ensureWallet, transfer, paise, validateKey, walletError, bookingAmount, settleBooking, releaseBooking } from '../services/wallet.js'
const router = express.Router()
const wrap = fn => async (req, res) => {
  try { await fn(req, res) } catch (error) {
    res.status(error.statusCode || (error.code === 11000 ? 409 : 500)).json({ message: error.statusCode ? error.message : error.code === 11000 ? 'Operation already submitted. Refresh your wallet before retrying.' : 'Wallet operation unavailable. No partial transfer was committed.' })
  }
}
router.post('/bookings/:id/complete', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) walletError(400, 'Invalid booking.')
  const token = process.env.CHARGING_EVENT_TOKEN || ''
  const digest = value => createHash('sha256').update(value).digest()
  if (token.length < 32 || !timingSafeEqual(digest(req.get('Authorization') || ''), digest('Bearer ' + token))) walletError(403, 'Charging integration authorization required.')
  if (typeof req.body?.successful !== 'boolean') walletError(400, 'Send the charging outcome.')
  await mongoose.connection.transaction(async session => {
    const booking = await Booking.findById(req.params.id).session(session)
    if (!booking) walletError(404, 'Booking not found.')
    if (booking.sessionOutcome === 'completed' || booking.sessionOutcome === 'failed') {
      if ((booking.sessionOutcome === 'completed') === req.body.successful) return
      walletError(409, 'A different charging outcome was already recorded.')
    }
    if (booking.status !== 'confirmed' || !['RESERVED', 'PAID'].includes(booking.payment?.status) || booking.sessionOutcome === 'failed' || booking.startAt > new Date()) walletError(409, 'Booking is not eligible for charging settlement.')
    if (await Incident.exists({ booking: booking._id }).session(session)) walletError(409, 'Reported failed sessions require review and cannot generate earnings.')
    if (!req.body.successful) {
      await releaseBooking(booking, session)
      booking.sessionOutcome = 'failed'
      await booking.save({ session })
      return
    }
    await settleBooking(booking, session)
    const payment = await Ledger.findById(booking.payment.transactionId).session(session)
    if (!payment || payment.type !== 'PAYMENT' || String(payment.bookingId) !== booking.id || payment.amountInPaise !== booking.payment.amountInPaise) walletError(409, 'Original payment could not be verified.')
    booking.sessionOutcome = 'completed'; booking.completedAt = new Date()
    await booking.save({ session })
    if (booking.payment.hostId) await transfer({ userId: booking.payment.hostId, role: 'host', amount: payment.amountInPaise, type: 'EARNING', key: `earning:${booking.id}`, bookingId: booking._id, relatedTransactionId: payment._id, description: 'completed charging earnings — no platform commission' }, session)
  })
  res.json({ message: 'Charging outcome recorded.' })
}))
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  if (!req.session?.consumerId) return res.status(401).json({ message: 'Please log in.' })
  if (req.method !== 'GET' && (!req.is('application/json') || req.get('sec-fetch-site') === 'cross-site')) return res.status(403).json({ message: 'Use a same-site JSON request.' })
  next()
})
function roleOf(req) { const role = req.query.role || 'consumer'; if (!['consumer', 'host'].includes(role)) walletError(400, 'Invalid wallet role.'); return role }
router.get('/', wrap(async (req, res) => {
  const wallet = await ensureWallet(req.session.consumerId, roleOf(req))
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1))
  const transactions = await Ledger.find({ walletId: wallet._id }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 25).limit(26).lean()
  res.json({ wallet, transactions: transactions.slice(0, 25).map(entry => ({ ...entry, description: entry.description.replace(/^DEMO\s+/i, '') })), hasMore: transactions.length > 25, page })
}))
router.post('/recharge', wrap(async (req, res) => {
  const amount = paise(req.body.amount)
  if (amount < 100 || amount > 1000000) walletError(400, 'Recharge must be between ₹1 and ₹10,000.')
  const key = `recharge:${req.session.consumerId}:${validateKey(req.body.idempotencyKey)}`
  const transaction = await mongoose.connection.transaction(session => transfer({ userId: req.session.consumerId, role: 'consumer', amount, type: 'RECHARGE', key, description: 'Wallet recharge (simulated funds)' }, session))
  res.json({ transaction, message: 'Wallet recharge successful.' })
}))
router.post('/quote', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.body.stationId) || !mongoose.isValidObjectId(req.body.batteryId)) walletError(400, 'Select station and battery.')
  const station = await Station.findById(req.body.stationId)
  const consumer = await Consumer.findById(req.session.consumerId)
  const battery = consumer?.batteries.id(req.body.batteryId)
  if (!station || !battery) walletError(404, 'Station or saved battery not found.')
  const point = station.pointBookingEnabled ? station.chargers.id(req.body.chargingPointId) : null
  if (station.pointBookingEnabled && !point) walletError(400, 'Select a dock at this station.')
  const { initialCharge, finalCharge, durationMinutes } = req.body
  if (!Number.isFinite(initialCharge) || !Number.isFinite(finalCharge) || initialCharge < 0 || finalCharge > 100 || finalCharge <= initialCharge || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) walletError(400, 'Invalid charging range or duration.')
  const amountInPaise = bookingAmount(station, point, battery, initialCharge, finalCharge, durationMinutes)
  const wallet = await ensureWallet(req.session.consumerId, 'consumer')
  res.json({ amountInPaise, balanceInPaise: wallet.balanceInPaise - wallet.reservedInPaise, currency: 'INR', sufficient: wallet.balanceInPaise - wallet.reservedInPaise >= amountInPaise })
}))
const istDay = date => new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 10)
router.get('/earnings', wrap(async (req, res) => {
  const range = req.query.range || '7'
  if (!['7', '30', '6m'].includes(range)) walletError(400, 'Invalid earnings range.')
  const wallet = await ensureWallet(req.session.consumerId, 'host')
  const today = istDay(new Date()), month = today.slice(0, 7)
  const totals = await Ledger.aggregate([
    { $match: { walletId: wallet._id, type: { $in: ['EARNING', 'REVERSAL'] } } },
    { $project: { amount: { $cond: [{ $eq: ['$type', 'REVERSAL'] }, { $multiply: ['$amountInPaise', -1] }, '$amountInPaise'] }, type: 1, day: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } } } },
    { $group: { _id: '$day', amountInPaise: { $sum: '$amount' }, sessions: { $sum: { $cond: [{ $eq: ['$type', 'EARNING'] }, 1, -1] } } } },
  ])
  const buckets = new Map()
  for (let i = (range === '6m' ? 6 : Number(range)) - 1; i >= 0; i--) {
    const date = new Date(`${today}T00:00:00Z`)
    if (range === '6m') { date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - i) } else date.setUTCDate(date.getUTCDate() - i)
    buckets.set(date.toISOString().slice(0, range === '6m' ? 7 : 10), 0)
  }
  let total = 0, daily = 0, monthly = 0, sessions = 0
  for (const row of totals) {
    total += row.amountInPaise; sessions += row.sessions
    if (row._id === today) daily += row.amountInPaise
    if (row._id.startsWith(month)) monthly += row.amountInPaise
    const key = range === '6m' ? row._id.slice(0, 7) : row._id
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + row.amountInPaise)
  }
  res.json({ totalInPaise: total, todayInPaise: daily, monthInPaise: monthly, completedSessions: sessions, balanceInPaise: wallet.balanceInPaise, series: [...buckets].map(([label, amountInPaise]) => ({ label, amountInPaise })), timezone: 'Asia/Kolkata' })
}))
export default router
