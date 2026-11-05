
import mongoose from 'mongoose'

const chargerSchema = new mongoose.Schema(
    {
        chargerType: {
            type: String,
            enum: ['portable', 'wallbox', 'AC', 'DC', 'other'],
            required: true,
        },

        chargingMode: {
            type: String,
            enum: ['AC', 'DC'],
            required: true,
        },

        connectorTypes: {
            type: [String],
            required: true,
        },

        powerOutputKW: {
            type: Number,
            required: true,
            min: 0.1,
        },

        voltageV: {
            type: Number,
            min: 0,
        },

        currentA: {
            type: Number,
            min: 0,
        },

        phase: {
            type: String,
            enum: ['single', 'three', 'not_applicable'],
            default: 'not_applicable',
        },

        totalPorts: {
            type: Number,
            required: true,
            min: 1,
            default: 1,
        },
    },
    { _id: true }
)

const pricingSchema = new mongoose.Schema(
    {
        pricingModel: {
            type: String,
            enum: [
                'per_kwh',
                'per_minute',
                'per_session',
                'per_kwh_plus_time',
            ],
            required: true,
            default: 'per_kwh',
        },

        pricePerKWh: {
            type: Number,
            min: 0,
            default: 0,
        },

        pricePerMinute: {
            type: Number,
            min: 0,
            default: 0,
        },

        sessionFee: {
            type: Number,
            min: 0,
            default: 0,
        },

        currency: {
            type: String,
            default: 'INR',
        },
    },
    { _id: false }
)

// One reservable time interval at a charging station.
const timeSlotSchema = new mongoose.Schema(
    {
        date: {
            type: Date,
            required: true,
        },

        startTime: {
            type: String,
            required: true,
            match: /^([01]\d|2[0-3]):[0-5]\d$/,
        },

        endTime: {
            type: String,
            required: true,
            match: /^([01]\d|2[0-3]):[0-5]\d$/,
        },

        status: {
            type: String,
            enum: ['available', 'booked', 'unavailable'],
            default: 'available',
            required: true,
        },
    },
    { _id: true }
)

const chargingStationSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        stationCode: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        description: {
            type: String,
            default: '',
        },

        stationType: {
            type: String,
            enum: ['public', 'business', 'residential', 'private_hosted'],
            required: true,
        },

        address: {
            type: String,
            required: true,
            trim: true,
        },

        area: {
            type: String,
            default: '',
        },

        location: {
            type: {
                type: String,
                enum: ['Point'],
                required: true,
                default: 'Point',
            },

            coordinates: {
                type: [Number],
                required: true,
                validate: {
                    validator: (coordinates) =>
                        coordinates.length === 2 &&
                        coordinates[0] >= -180 &&
                        coordinates[0] <= 180 &&
                        coordinates[1] >= -90 &&
                        coordinates[1] <= 90,
                    message:
                        'Coordinates must contain longitude and latitude in that order.',
                },
            },
        },

        imageUrl: {
            type: String,
            default: '',
        },

        hostId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Consumer',
            default: null,
        },

        chargers: {
            type: [chargerSchema],
            required: true,
            validate: {
                validator: (chargers) => chargers.length > 0,
                message:
                    'A station must have at least one charger configuration.',
            },
        },

        pricing: {
            type: pricingSchema,
            required: true,
        },

        status: {
            type: String,
            enum: ['available', 'busy', 'offline', 'maintenance'],
            default: 'available',
        },

        openingHours: {
            type: String,
            default: '00:00-23:59',
        },

        amenities: {
            type: [String],
            default: [],
        },

        // Available and booked intervals for the Details page.
        timeSlots: {
            type: [timeSlotSchema],
            default: [],
        },

        isDemo: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
)

// Enables nearby-station queries using GeoJSON coordinates.
chargingStationSchema.index({ location: '2dsphere' })

const ChargingStation = mongoose.model(
    'ChargingStation',
    chargingStationSchema
)

export default ChargingStation
