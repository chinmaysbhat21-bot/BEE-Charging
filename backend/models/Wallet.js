import mongoose from 'mongoose'
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consumer', required: true },
  role: { type: String, enum: ['consumer', 'host'], required: true },
  balanceInPaise: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  reservedInPaise: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  currency: { type: String, enum: ['INR'], default: 'INR' },
}, { timestamps: true })
schema.index({ userId: 1, role: 1 }, { unique: true })
export default mongoose.model('Wallet', schema)
