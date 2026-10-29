
import mongoose from 'mongoose'

const addressSchema = new mongoose.Schema(
  {
    nickname: {
      type: String,
      required: true,
      trim: true,
    },
    houseNumber: {
      type: String,
      required: true,
      trim: true,
    },
    street: {
      type: String,
      required: true,
      trim: true,
    },
    landmark: {
      type: String,
      default: '',
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    pincode: {
      type: String,
      required: true,
      trim: true,
    },
    fullAddress: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
)

const batterySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    vehicleMake: {
      type: String,
      required: true,
      trim: true,
    },

    vehicleModel: {
      type: String,
      required: true,
      trim: true,
    },

    capacityKwh: {
      type: Number,
      required: true,
      min: 0.1,
    },

    batteryChemistry: {
      type: String,
      enum: ['LFP', 'NMC', 'Other/Unknown'],
      default: 'Other/Unknown',
    },

    // Supports multiple connector types.
    connectorTypes: {
      type: [String],
      default: [],
    },

    // Legacy field retained for compatibility.
    connectorType: {
      type: String,
      trim: true,
    },

    // Separate maximum charging power values.
    maxAcChargingPowerKw: {
      type: Number,
      min: 0.1,
    },

    maxDcChargingPowerKw: {
      type: Number,
      min: 0.1,
    },

    // Legacy field retained for existing frontend/backend code.
    maxChargingPowerKw: {
      type: Number,
      min: 0.1,
    },
  },
  { timestamps: true }
)

const consumerSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    middleName: {
      type: String,
      default: null,
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },

    mobileNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    role: {
      type: String,
      default: 'CONSUMER',
    },

    profilePhoto: {
      type: String,
      default: '',
    },

    addresses: {
      type: [addressSchema],
      default: [],
    },

    batteries: {
      type: [batterySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
)

const Consumer = mongoose.model('Consumer', consumerSchema)

export default Consumer
