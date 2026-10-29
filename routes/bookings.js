import express from 'express'
import mongoose from 'mongoose'
import Booking from '../models/Booking.js'
import ChargingStation from '../models/ChargingStation.js'
import Consumer from '../models/consumer.js'

const router = express.Router()


let bookingQueue = Promise.resolve()

async function withBookingLock(task) {
    const previous = bookingQueue

    let release
    bookingQueue = new Promise((resolve) => {
        release = resolve
    })

    await previous

    try {
        return await task()
    } finally {
        release()
    }
}


function timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number)
    return hours * 60 + minutes
}

function minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60

    return `${String(hours).padStart(2, '0')}:${String(
        remainingMinutes
    ).padStart(2, '0')}`
}

function isValidDate(date) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return false
    }

    const parsed = new Date(`${date}T00:00:00.000Z`)

    return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === date
    )
}

function normalizeConnector(connector) {
    if (!connector) return ''

    const value = String(connector)
        .trim()
        .toLowerCase()
        .replace(/[\s_-]/g, '')

    const aliases = {
        ccs2: 'ccs2',
        ccstype2: 'ccs2',
        ccscombo2: 'ccs2',
        type2: 'type2',
        mennekestype2: 'type2',
        chademo: 'chademo',
        type1: 'type1',
        j1772: 'type1',
        gbt: 'gbt',
        gbttype2: 'gbt',
    }

    return aliases[value] || value
}

function getVehicleConnectors(battery) {
    const connectors =
        Array.isArray(battery.connectorTypes) &&
            battery.connectorTypes.length > 0
            ? battery.connectorTypes
            : battery.connectorType
                ? [battery.connectorType]
                : []

    return connectors.map(normalizeConnector).filter(Boolean)
}

function calculateRequiredChargingMinutes(
    battery,
    station,
    initialCharge,
    finalCharge
) {
    const capacityKwh = Number(battery.capacityKwh)

    if (!Number.isFinite(capacityKwh) || capacityKwh <= 0) {
        const error = new Error('The saved battery capacity is invalid.')
        error.statusCode = 400
        throw error
    }

    const vehicleConnectors = getVehicleConnectors(battery)

    if (vehicleConnectors.length === 0) {
        const error = new Error(
            'No connector type is saved for your vehicle. Update your vehicle details first.'
        )
        error.statusCode = 400
        throw error
    }

    // ChargingStation.js stores connectorTypes as an array.
    const compatibleChargers = station.chargers.filter((charger) => {
        const chargerConnectors = Array.isArray(charger.connectorTypes)
            ? charger.connectorTypes.map(normalizeConnector).filter(Boolean)
            : []

        return chargerConnectors.some((connector) =>
            vehicleConnectors.includes(connector)
        )
    })

    if (compatibleChargers.length === 0) {
        const error = new Error(
            'This station does not have a compatible connector for your vehicle.'
        )
        error.statusCode = 400
        throw error
    }

    // Use the power limit that matches the charger's AC/DC charging mode.
    const possibleChargingPowers = compatibleChargers
        .map((charger) => {
            const chargerPower = Number(charger.powerOutputKW)

            if (!Number.isFinite(chargerPower) || chargerPower <= 0) {
                return 0
            }

            const chargingMode = String(charger.chargingMode || '').toUpperCase()

            let vehiclePower

            const hasModeSpecificPower =
                (battery.maxAcChargingPowerKw !== undefined && battery.maxAcChargingPowerKw !== null) ||
                (battery.maxDcChargingPowerKw !== undefined && battery.maxDcChargingPowerKw !== null)

            if (chargingMode === 'DC') {
                vehiclePower = Number(battery.maxDcChargingPowerKw)
            } else if (chargingMode === 'AC') {
                vehiclePower = Number(battery.maxAcChargingPowerKw)
            }

            // Support the legacy maximum-power field if mode-specific
            // vehicle power is not available.
            if ((!Number.isFinite(vehiclePower) || vehiclePower <= 0) && !hasModeSpecificPower) {
                vehiclePower = Number(battery.maxChargingPowerKw)
            }

            if (!Number.isFinite(vehiclePower) || vehiclePower <= 0) {
                if (hasModeSpecificPower) return 0
                return chargerPower
            }

            return Math.min(vehiclePower, chargerPower)
        })
        .filter((power) => Number.isFinite(power) && power > 0)

    if (possibleChargingPowers.length === 0) {
        const error = new Error(
            'Charging power could not be determined from the saved vehicle and charger details.'
        )
        error.statusCode = 400
        throw error
    }

    // Use the fastest compatible charger for the estimated duration.
    const chargingPower = Math.max(...possibleChargingPowers)

    const energyRequired =
        (capacityKwh * (Number(finalCharge) - Number(initialCharge))) / 100

    return Math.ceil((energyRequired / chargingPower) * 60)
}


router.get('/my', async (req, res) => {
    try {
        if (!req.session?.consumerId) {
            return res.status(401).json({
                message: 'Please log in to view your bookings.',
            })
        }

        const consumerId = String(req.session.consumerId)

        const [bookings, consumer] = await Promise.all([
            Booking.find({ consumerId })
                .populate('station', 'name address stationCode')
                .sort({ startAt: 1 }),

            Consumer.findOne({ _id: consumerId }).select('batteries'),
        ])

        const bookingsWithDetails = bookings.map((booking) => {
            const bookingData = booking.toObject()

            const battery = consumer?.batteries?.find(
                (item) =>
                    String(item._id) === String(booking.batteryId)
            )

            return {
                ...bookingData,
                initialCharge: booking.initialCharge,
                finalCharge: booking.finalCharge,
                battery: battery
                    ? {
                        _id: battery._id,
                        name: battery.name,
                    }
                    : null,
            }
        })

        return res.status(200).json({
            bookings: bookingsWithDetails,
        })
    } catch (error) {
        console.error('Fetch my bookings error:', error)

        return res.status(500).json({
            message: 'Unable to retrieve your bookings.',
        })
    }
})

router.post('/', async (req, res) => {
    return withBookingLock(async () => {
        let session

        try {
            if (!req.session?.consumerId) {
                return res.status(401).json({
                    message: 'Please log in to book a charging station.',
                })
            }

            const {
                stationId,
                date,
                startTime,
                endTime,
                batteryId,
                initialCharge,
                finalCharge,
            } = req.body

            if (
                !stationId ||
                !mongoose.isValidObjectId(stationId) ||
                !batteryId ||
                !mongoose.isValidObjectId(batteryId) ||
                !isValidDate(date) ||
                !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime || '') ||
                !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime || '')
            ) {
                return res.status(400).json({
                    message: 'Please provide valid booking details.',
                })
            }

            if (
                initialCharge === undefined ||
                finalCharge === undefined ||
                initialCharge === '' ||
                finalCharge === '' ||
                !Number.isFinite(Number(initialCharge)) ||
                !Number.isFinite(Number(finalCharge)) ||
                Number(initialCharge) < 0 ||
                Number(finalCharge) > 100 ||
                Number(finalCharge) <= Number(initialCharge)
            ) {
                return res.status(400).json({
                    message: 'Please provide valid initial and final battery charges.',
                })
            }

            const startMinutes = timeToMinutes(startTime)
            const endMinutes = timeToMinutes(endTime)

            if (endMinutes <= startMinutes) {
                return res.status(400).json({
                    message: 'The booking end time must be after the start time.',
                })
            }

            const requestedStart = new Date(`${date}T${startTime}:00`)
            const requestedEnd = new Date(`${date}T${endTime}:00`)

            if (
                Number.isNaN(requestedStart.getTime()) ||
                Number.isNaN(requestedEnd.getTime())
            ) {
                return res.status(400).json({
                    message: 'The selected booking date or time is invalid.',
                })
            }

            if (requestedStart <= new Date()) {
                return res.status(400).json({
                    message: 'Please select a future booking time.',
                })
            }

            const consumerId = String(req.session.consumerId)
            const requestedDurationMinutes = endMinutes - startMinutes

            session = await mongoose.startSession()

            let createdBooking
            let requiredMinutes

            await session.withTransaction(async () => {
                // Always read the latest documents inside the transaction.

                const station = await ChargingStation.findById(stationId).session(session)
                const consumer = await Consumer.findById(consumerId).session(session)


                if (!station) {
                    const error = new Error('Charging station not found.')
                    error.statusCode = 404
                    throw error
                }

                if (!consumer) {
                    const error = new Error(
                        'Consumer account not found. Please log in again.'
                    )
                    error.statusCode = 404
                    throw error
                }

                if (station.status !== 'available') {
                    const error = new Error(
                        'This charging station is not currently available.'
                    )
                    error.statusCode = 400
                    throw error
                }

                const battery = consumer.batteries.id(batteryId)

                if (!battery) {
                    const error = new Error(
                        'The selected saved vehicle battery was not found.'
                    )
                    error.statusCode = 404
                    throw error
                }

                requiredMinutes = calculateRequiredChargingMinutes(
                    battery,
                    station,
                    Number(initialCharge),
                    Number(finalCharge)
                )

                if (requestedDurationMinutes < requiredMinutes) {
                    const error = new Error(
                        `This charge requires approximately ${requiredMinutes} minutes. Please select a longer time slot.`
                    )
                    error.statusCode = 400
                    error.requiredMinutes = requiredMinutes
                    throw error
                }

                // Serialize competing bookings for this station and consumer.
                // The writes are part of the transaction and roll back on failure.
                const stationLock = await ChargingStation.updateOne(
                    { _id: station._id },
                    { $inc: { __v: 1 } },
                    { session }
                )

                const consumerLock = await Consumer.updateOne(
                    { _id: consumer._id },
                    { $inc: { __v: 1 } },
                    { session }
                )

                if (stationLock.matchedCount !== 1 ||
                    consumerLock.matchedCount !== 1) {
                    const error = new Error(
                        'Unable to secure this booking. Please try again.'
                    )
                    error.statusCode = 409
                    throw error
                }

                const availableSlots = station.timeSlots.filter((slot) => {
                    const slotDate = new Date(slot.date)
                    const slotDateKey = [
                        slotDate.getFullYear(),
                        String(slotDate.getMonth() + 1).padStart(2, '0'),
                        String(slotDate.getDate()).padStart(2, '0'),
                    ].join('-')

                    return (
                        slotDateKey === date &&
                        slot.status === 'available'
                    )
                })

                const fitsAvailableSlot = availableSlots.some((slot) => (
                    startMinutes >= timeToMinutes(slot.startTime) &&
                    endMinutes <= timeToMinutes(slot.endTime)
                ))

                if (!fitsAvailableSlot) {
                    const error = new Error(
                        'The selected time is not available at this station. Please choose another slot.'
                    )
                    error.statusCode = 409
                    throw error
                }

                const stationConflict = await Booking.findOne({
                    station: station._id,
                    date,
                    status: 'confirmed',
                    startAt: { $lt: requestedEnd },
                    endAt: { $gt: requestedStart },
                }).session(session)

                if (stationConflict) {
                    const error = new Error(
                        'This charging station has already been booked for part of that time. Please choose another slot.'
                    )
                    error.statusCode = 409
                    throw error
                }

                // A battery conflict applies across every station.
                const batteryConflict = await Booking.findOne({
                    consumerId,
                    batteryId,
                    date,
                    status: 'confirmed',
                    startAt: { $lt: requestedEnd },
                    endAt: { $gt: requestedStart },
                }).session(session)

                if (batteryConflict) {
                    const error = new Error(
                        'This saved vehicle already has a booking during that time, even at another station. Please choose a different time.'
                    )
                    error.statusCode = 409
                    throw error
                }

                const [booking] = await Booking.create(
                    [{
                        station: station._id,
                        consumerId,
                        batteryId,
                        initialCharge,
                        finalCharge,
                        date,
                        startTime,
                        endTime,
                        startAt: requestedStart,
                        endAt: requestedEnd,
                        durationMinutes: requestedDurationMinutes,
                        status: 'confirmed',
                    }],
                    { session }
                )

                const updatedSlots = []

                for (const slot of station.timeSlots) {
                    const slotDate = new Date(slot.date)
                    const slotDateKey = [
                        slotDate.getFullYear(),
                        String(slotDate.getMonth() + 1).padStart(2, '0'),
                        String(slotDate.getDate()).padStart(2, '0'),
                    ].join('-')

                    const sameDate = slotDateKey === date

                    if (
                        !sameDate ||
                        slot.status !== 'available' ||
                        endMinutes <= timeToMinutes(slot.startTime) ||
                        startMinutes >= timeToMinutes(slot.endTime)
                    ) {
                        updatedSlots.push(slot.toObject())
                        continue
                    }

                    const slotStart = timeToMinutes(slot.startTime)
                    const slotEnd = timeToMinutes(slot.endTime)

                    if (slotStart < startMinutes) {
                        updatedSlots.push({
                            date: slot.date,
                            startTime: slot.startTime,
                            endTime: minutesToTime(startMinutes),
                            status: 'available',
                        })
                    }

                    updatedSlots.push({
                        date: slot.date,
                        startTime: minutesToTime(
                            Math.max(slotStart, startMinutes)
                        ),
                        endTime: minutesToTime(
                            Math.min(slotEnd, endMinutes)
                        ),
                        status: 'booked',
                    })

                    if (endMinutes < slotEnd) {
                        updatedSlots.push({
                            date: slot.date,
                            startTime: minutesToTime(endMinutes),
                            endTime: slot.endTime,
                            status: 'available',
                        })
                    }
                }

                const stationUpdate = await ChargingStation.updateOne(
                    { _id: station._id },
                    {
                        $set: { timeSlots: updatedSlots },
                        $inc: { __v: 1 },
                    },
                    { session, runValidators: true }
                )

                if (stationUpdate.matchedCount !== 1) {
                    throw new Error(
                        'Unable to update station availability.'
                    )
                }

                createdBooking = booking
            })

            return res.status(201).json({
                message: 'Charging station booked successfully.',
                booking: createdBooking,
                requiredMinutes,
            })
        } catch (error) {
            console.error('Booking error:', error)

            if (error.statusCode) {
                return res.status(error.statusCode).json({
                    message: error.message,
                    ...(error.requiredMinutes !== undefined
                        ? { requiredMinutes: error.requiredMinutes }
                        : {}),
                })
            }

            if (
                error.code === 112 ||
                error.codeName === 'WriteConflict' ||
                error.hasErrorLabel?.('TransientTransactionError')
            ) {
                return res.status(409).json({
                    message:
                        'Another booking is being processed at the same time. Please try booking again.',
                })
            }

            return res.status(500).json({
                message: 'Unable to complete the booking. Please try again.',
            })
        } finally {
            if (session) {
                await session.endSession()
            }
        }
    })
})

// Cancel a booking belonging to the logged-in consumer

router.delete('/:bookingId', async (req, res) => {
    const session = await mongoose.startSession()

    try {
        if (!req.session?.consumerId) {
            return res.status(401).json({
                message: 'Please log in to cancel your booking.',
            })
        }

        const { bookingId } = req.params
        const consumerId = String(req.session.consumerId)

        if (!mongoose.isValidObjectId(bookingId)) {
            return res.status(400).json({
                message: 'Invalid booking ID.',
            })
        }

        let responseStatus = 200
        let responseBody = null

        await session.withTransaction(async () => {
            const booking = await Booking.findOne({
                _id: bookingId,
                consumerId,
                status: 'confirmed',
            }).session(session)

            if (!booking) {
                responseStatus = 404
                responseBody = {
                    message: 'Booking not found or already cancelled.',
                }
                return
            }

            const cancellationDeadline =
                new Date(booking.startAt).getTime() -
                60 * 60 * 1000

            if (Date.now() >= cancellationDeadline) {
                responseStatus = 400
                responseBody = {
                    message:
                        'Bookings can only be cancelled at least one hour before the session starts.',
                }
                return
            }

            const station = await ChargingStation.findById(
                booking.station
            ).session(session)

            if (!station) {
                responseStatus = 404
                responseBody = {
                    message:
                        'The charging station for this booking was not found.',
                }
                return
            }

            const bookingDate = booking.date
            const startMinutes = timeToMinutes(booking.startTime)
            const endMinutes = timeToMinutes(booking.endTime)

            const getDateKey = (value) => {
                const date = new Date(value)

                return [
                    date.getFullYear(),
                    String(date.getMonth() + 1).padStart(2, '0'),
                    String(date.getDate()).padStart(2, '0'),
                ].join('-')
            }

            const matchingSlots = station.timeSlots.filter(
                (slot) => getDateKey(slot.date) === bookingDate
            )

            const overlappingAvailable = matchingSlots
                .filter((slot) => slot.status === 'available')
                .map((slot) => ({
                    start: timeToMinutes(slot.startTime),
                    end: timeToMinutes(slot.endTime),
                }))
                .filter(
                    (slot) =>
                        slot.start < endMinutes &&
                        slot.end > startMinutes
                )

            let restoreStart = startMinutes
            let restoreEnd = endMinutes

            for (const slot of overlappingAvailable) {
                restoreStart = Math.min(restoreStart, slot.start)
                restoreEnd = Math.max(restoreEnd, slot.end)
            }

            // Remove only available intervals that overlap the
            // cancelled booking. Preserve booked/unavailable intervals.
            station.timeSlots = station.timeSlots.filter((slot) => {
                if (
                    getDateKey(slot.date) !== bookingDate ||
                    slot.status !== 'available'
                ) {
                    return true
                }

                const slotStart = timeToMinutes(slot.startTime)
                const slotEnd = timeToMinutes(slot.endTime)

                return !(
                    slotStart < endMinutes &&
                    slotEnd > startMinutes
                )
            })

            station.timeSlots.push({
                date: new Date(`${bookingDate}T00:00:00`),
                startTime: minutesToTime(restoreStart),
                endTime: minutesToTime(restoreEnd),
                status: 'available',
            })

            await station.save({ session })

            // Update just the status; do not validate unrelated
            // required fields such as initialCharge/finalCharge.
            const updateResult = await Booking.updateOne(
                {
                    _id: booking._id,
                    consumerId,
                    status: 'confirmed',
                },
                {
                    $set: { status: 'cancelled' },
                },
                { session }
            )

            if (updateResult.modifiedCount !== 1) {
                throw new Error(
                    'Booking status was not updated during cancellation.'
                )
            }

            responseStatus = 200
            responseBody = {
                message: 'Booking cancelled successfully.',
                bookingId: booking._id,
            }
        })

        return res.status(responseStatus).json(responseBody)
    } catch (error) {
        console.error('Cancel booking error:', error)

        return res.status(500).json({
            message: 'Unable to cancel the booking. Please try again.',
        })
    } finally {
        await session.endSession()
    }
})


export default router
