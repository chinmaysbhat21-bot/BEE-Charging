import mongoose from 'mongoose'
import Booking from '../models/Booking.js'
import { reportWindow } from './chargeGuard.js'
import { releaseBooking } from './wallet.js'

const hour = 60 * 60 * 1000

export function isAwaitingExpiry(booking, now = Date.now()) {
  return booking.status === 'confirmed' &&
    (!booking.sessionOutcome || booking.sessionOutcome === 'pending') &&
    reportWindow(booking).end + hour <= now
}

export async function expireBooking(booking, session) {
  booking.sessionOutcome = 'expired'
  if (booking.payment?.status === 'RESERVED') {
    await releaseBooking(booking, session)
  } else {
    await booking.save({ session })
  }
}

export async function expireOverdueBookings() {
  const now = Date.now()
  // Legacy UTC wall times can be 5h30 ahead of their actual end.
  const candidates = Booking.find({
    status: 'confirmed',
    sessionOutcome: { $nin: ['completed', 'failed', 'expired'] },
    endAt: { $lte: new Date(now - hour + 330 * 60000) },
  }).select('status sessionOutcome startAt endAt date startTime endTime').lean().cursor()

  for await (const candidate of candidates) {
    if (!isAwaitingExpiry(candidate, now)) continue
    try {
      await mongoose.connection.transaction(async session => {
        const booking = await Booking.findById(candidate._id).session(session)
        if (booking && isAwaitingExpiry(booking, now)) await expireBooking(booking, session)
      })
    } catch (error) {
      console.error('Booking expiry failed:', candidate._id, error.message)
    }
  }
}
