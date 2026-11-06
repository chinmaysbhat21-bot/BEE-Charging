import mongoose from 'mongoose'
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  type: { type: String, enum: ['RECHARGE', 'PAYMENT', 'REFUND', 'EARNING', 'REVERSAL'], required: true },
  direction: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
  amountInPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  currency: { type: String, default: 'INR', enum: ['INR'] },
  status: { type: String, enum: ['SUCCESSFUL', 'REFUNDED'], default: 'SUCCESSFUL' },
  description: { type: String, required: true },
  relatedTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },
  idempotencyKey: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false })
schema.index({ walletId: 1, createdAt: -1 })
schema.index({ bookingId: 1, type: 1 })
schema.pre('save', function () { if (!this.isNew) throw new Error('Wallet ledger is immutable.') })
for (const operation of ['bulkWrite', 'updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) schema.pre(operation, function () { throw new Error('Wallet ledger is immutable.') })
export default mongoose.model('WalletTransaction', schema)
