import Wallet from '../models/Wallet.js'
import Ledger from '../models/WalletTransaction.js'
export function walletError(statusCode, message) { throw Object.assign(new Error(message), { statusCode }) }
export function paise(value) {
  const text = String(value ?? '')
  if (!/^\d+(\.\d{1,2})?$/.test(text)) walletError(400, 'Enter a valid INR amount with at most two decimals.')
  const [whole, fraction = ''] = text.split('.')
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(amount) || amount > 100000000) walletError(400, 'Amount is out of range.')
  return amount
}
export function validateKey(key) {
  if (typeof key !== 'string' || !/^[a-zA-Z0-9:_-]{8,150}$/.test(key)) walletError(400, 'A valid idempotency key is required.')
  return key
}
export async function ensureWallet(userId, role, session) {
  return Wallet.findOneAndUpdate({ userId, role }, { $setOnInsert: { balanceInPaise: 0, currency: 'INR' } }, { upsert: true, returnDocument: 'after', session })
}
// All callers must supply the same transaction session as their booking mutation.
export async function transfer({ userId, role, amount, type, key, bookingId, relatedTransactionId, description }, session) {
  const old = await Ledger.findOne({ idempotencyKey: key }).session(session)
  if (old) {
    if (String(old.userId) !== String(userId) || old.amountInPaise !== amount || old.type !== type) walletError(409, 'Idempotency key was already used for another operation.')
    return old
  }
  if (!Number.isSafeInteger(amount) || amount < 0) walletError(400, 'Invalid payment amount.')
  const debit = ['PAYMENT', 'REVERSAL'].includes(type)
  const wallet = await ensureWallet(userId, role, session)
  const updated = await Wallet.updateOne({ _id: wallet._id, ...(debit ? { balanceInPaise: { $gte: amount } } : { balanceInPaise: { $lte: Number.MAX_SAFE_INTEGER - amount } }) }, { $inc: { balanceInPaise: debit ? -amount : amount } }, { session })
  if (updated.matchedCount !== 1) walletError(402, 'Insufficient BEE wallet balance. Add money and try again.')
  const [entry] = await Ledger.create([{ userId, walletId: wallet._id, bookingId, amountInPaise: amount, type, direction: debit ? 'DEBIT' : 'CREDIT', status: type === 'REFUND' ? 'REFUNDED' : 'SUCCESSFUL', idempotencyKey: key, relatedTransactionId, description }], { session })
  return entry
}
// Decimal arithmetic for energy tariffs, rounded once to the nearest paise.
function decimal(value) {
  const text = String(value)
  if (!/^\d+(\.\d+)?$/.test(text)) walletError(400, 'Invalid charging tariff or battery capacity.')
  const [whole, fraction = ''] = text.split('.')
  return [BigInt(whole + fraction), 10n ** BigInt(fraction.length)]
}
export function bookingAmount(station, point, battery, initialCharge, finalCharge, minutes) {
  const pricing = point?.pricePerKWh != null ? { pricingModel: 'per_kwh', pricePerKWh: point.pricePerKWh } : station.pricing
  let numerator = 0n, denominator = 1n
  const add = (n, d = 1n) => { numerator = numerator * d + n * denominator; denominator *= d }
  if (['per_kwh', 'per_kwh_plus_time'].includes(pricing.pricingModel)) {
    const [capacity, scale] = decimal(battery.capacityKwh)
    const [start, ss] = decimal(initialCharge), [end, es] = decimal(finalCharge)
    add(capacity * (end * ss - start * es) * BigInt(paise(pricing.pricePerKWh || 0)), scale * ss * es * 100n)
  }
  if (['per_minute', 'per_kwh_plus_time'].includes(pricing.pricingModel)) add(BigInt(minutes) * BigInt(paise(pricing.pricePerMinute || 0)))
  if (['per_session', 'per_kwh_plus_time'].includes(pricing.pricingModel)) add(BigInt(paise(pricing.sessionFee || 0)))
  const amount = Number((numerator + denominator / 2n) / denominator)
  if (!Number.isSafeInteger(amount) || amount < 0) walletError(400, 'Invalid booking amount.')
  return amount
}
export async function reserveBooking(booking, station, point, battery, session) {
  const amount = bookingAmount(station, point, battery, booking.initialCharge, booking.finalCharge, booking.durationMinutes)
  const wallet = await ensureWallet(booking.consumerId, 'consumer', session)
  const result = await Wallet.updateOne({
    _id: wallet._id,
    $expr: { $gte: [{ $subtract: ['$balanceInPaise', { $ifNull: ['$reservedInPaise', 0] }] }, amount] },
  }, { $inc: { reservedInPaise: amount } }, { session })
  if (!result.matchedCount) walletError(402, 'Insufficient available wallet balance.')
  booking.payment = { amountInPaise: amount, hostId: station.hostId, status: 'RESERVED' }
  await booking.save({ session })
}
export async function releaseBooking(booking, session) {
  if (booking.payment?.status !== 'RESERVED') return
  const amount = booking.payment.amountInPaise
  const result = await Wallet.updateOne({ userId: booking.consumerId, role: 'consumer', reservedInPaise: { $gte: amount } }, { $inc: { reservedInPaise: -amount } }, { session })
  if (!result.matchedCount) walletError(409, 'Booking funds could not be released.')
  booking.payment.status = 'RELEASED'
  await booking.save({ session })
}
export async function settleBooking(booking, session) {
  if (booking.payment.status !== 'RESERVED') return
  await releaseBooking(booking, session)
  const payment = await transfer({ userId: booking.consumerId, role: 'consumer', amount: booking.payment.amountInPaise, type: 'PAYMENT', key: 'payment:' + booking.id, bookingId: booking._id, description: 'Charging payment' }, session)
  booking.payment.transactionId = payment._id
  booking.payment.status = 'PAID'
  await booking.save({ session })
}
export async function refundBooking(booking, session) {
  if (booking.payment?.status === 'RESERVED') return releaseBooking(booking, session)
  if (!booking.payment?.transactionId || booking.payment.status !== 'PAID') return
  const earning = await Ledger.findOne({ bookingId: booking._id, type: 'EARNING' }).session(session)
  if (earning) await transfer({ userId: earning.userId, role: 'host', amount: earning.amountInPaise, type: 'REVERSAL', key: `reversal:${booking.id}`, bookingId: booking._id, relatedTransactionId: earning._id, description: 'cancellation earnings reversal' }, session)
  await transfer({ userId: booking.consumerId, role: 'consumer', amount: booking.payment.amountInPaise, type: 'REFUND', key: `refund:${booking.id}`, bookingId: booking._id, relatedTransactionId: booking.payment.transactionId, description: 'eligible cancellation refund' }, session)
  booking.payment.status = 'REFUNDED'
  await booking.save({ session })
}
