import crypto from 'node:crypto'

const otpStore = new Map()

export function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString()
}

export default otpStore