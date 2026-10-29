
import mongoose from 'mongoose'

const bookingSchema = new mongoose.Schema(
    {
        station: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ChargingStation',
            required: true,
            index: true,
        },

        // Identifies the consumer who made the booking.
        // The backend route will populate this from the authenticated session.
        consumerId: {
            type: String,
            required: true,
            trim: true,
        },

        batteryId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },

        initialCharge: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },

        finalCharge: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },

        // Selected charging date in YYYY-MM-DD format.
        date: {
            type: String,
            required: true,
            match: /^\d{4}-\d{2}-\d{2}$/,
            index: true,
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

        // Exact start and end timestamps for overlap checks.
        startAt: {
            type: Date,
            required: true,
        },

        endAt: {
            type: Date,
            required: true,
        },

        durationMinutes: {
            type: Number,
            required: true,
            min: 1,
        },

        status: {
            type: String,
            enum: ['confirmed', 'cancelled'],
            default: 'confirmed',
            index: true,
        },
    },
    {
        timestamps: true,
    }
)

// Helps the backend find bookings for a station on a selected date.
bookingSchema.index({
    station: 1,
    date: 1,
    status: 1,
})

const Booking = mongoose.model('Booking', bookingSchema)

export default Booking
