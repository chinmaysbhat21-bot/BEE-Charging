import mongoose from 'mongoose'
import Booking from '../models/Booking.js'
import Incident from '../models/ChargingIncident.js'
import Ledger from '../models/WalletTransaction.js'
import { reportWindow } from './chargeGuard.js'
import { settleBooking, transfer, walletError } from './wallet.js'

function canComplete(booking, now) {
  return booking.status === 'confirmed' &&
    ['RESERVED', 'PAID'].includes(booking.payment?.status) &&
    (!booking.sessionOutcome || booking.sessionOutcome === 'pending') &&
    reportWindow(booking).end <= now
}

export async function completeBookingPayment(booking, session) {
  await settleBooking(booking, session)
  const payment = await Ledger.findById(booking.payment.transactionId).session(session)
  if (!payment || payment.type !== 'PAYMENT' || String(payment.bookingId) !== booking.id || payment.amountInPaise !== booking.payment.amountInPaise) walletError(409, 'Original payment could not be verified.')
  booking.sessionOutcome = 'completed'; booking.completedAt = new Date()
  await booking.save({ session })
  if (booking.payment.hostId) await transfer({ userId: booking.payment.hostId, role: 'host', amount: payment.amountInPaise, type: 'EARNING', key: `earning:${booking.id}`, bookingId: booking._id, relatedTransactionId: payment._id, description: 'completed charging earnings — no platform commission' }, session)
}

export async function completeEndedBookings() {
  const now = Date.now()
  // Legacy UTC wall times can be 5h30 ahead of their actual end.
  const candidates = Booking.find({
    status: 'confirmed',
    'payment.status': { $in: ['RESERVED', 'PAID'] },
    sessionOutcome: { $nin: ['completed', 'failed', 'expired'] },
    endAt: { $lte: new Date(now + 330 * 60000) },
  }).select('status payment.status sessionOutcome startAt endAt date startTime endTime').lean().cursor()

  for await (const candidate of candidates) {
    if (!canComplete(candidate, now)) continue
    try {
      await mongoose.connection.transaction(async session => {
        const booking = await Booking.findById(candidate._id).session(session)
        if (booking && canComplete(booking, now)) {
          if (!await Incident.exists({ booking: booking._id }).session(session)) {
            await completeBookingPayment(booking, session)
          }
        }
      })
    } catch (error) {
      console.error('Booking completion failed:', candidate._id, error.message)
    }
  }
}
