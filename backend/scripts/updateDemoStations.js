
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import ChargingStation from '../models/ChargingStation.js'

dotenv.config()

const stationHours = {
    'ATP-DEMO-001': { open: '05:00', close: '23:00' },
    'ATP-DEMO-002': { open: '06:00', close: '22:00' },
    'ATP-DEMO-003': { open: '08:00', close: '20:00' },
    'ATP-DEMO-004': { open: '07:00', close: '21:00' },
    'ATP-DEMO-005': { open: '10:00', close: '23:00' },
    'ATP-DEMO-006': { open: '09:00', close: '18:00' },
    'ATP-DEMO-007': { open: '00:00', close: '23:30' },
    'ATP-DEMO-008': { open: '06:30', close: '21:30' },
    'ATP-DEMO-009': { open: '08:00', close: '22:00' },
    'ATP-DEMO-010': { open: '07:30', close: '19:30' },
    'ATP-DEMO-011': { open: '17:00', close: '23:00' },
    'ATP-DEMO-012': { open: '16:00', close: '22:00' },
    'ATP-DEMO-013': { open: '09:00', close: '21:00' },
    'ATP-DEMO-014': { open: '06:00', close: '20:00' },
    'ATP-DEMO-015': { open: '05:30', close: '22:30' },
}

function timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number)
    return hours * 60 + minutes
}

function minutesToTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function dateKey(value) {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid time-slot date: ${value}`)
    }

    // Match the UTC date representation used by the booking route.
    return date.toISOString().slice(0, 10)
}

function makeDate(dateString) {
    return new Date(`${dateString}T00:00:00.000Z`)
}

function overlaps(startA, endA, startB, endB) {
    return startA < endB && endA > startB
}

function createFreeIntervals(openMinutes, closeMinutes, blockedSlots) {
    const blocked = blockedSlots
        .map((slot) => ({
            start: timeToMinutes(slot.startTime),
            end: timeToMinutes(slot.endTime),
        }))
        .filter(
            (slot) =>
                slot.end > openMinutes &&
                slot.start < closeMinutes &&
                slot.end > slot.start
        )
        .map((slot) => ({
            start: Math.max(slot.start, openMinutes),
            end: Math.min(slot.end, closeMinutes),
        }))
        .sort((a, b) => a.start - b.start)

    const freeIntervals = []
    let cursor = openMinutes

    for (const slot of blocked) {
        if (slot.start > cursor) {
            freeIntervals.push({
                start: cursor,
                end: slot.start,
            })
        }

        cursor = Math.max(cursor, slot.end)

        if (cursor >= closeMinutes) {
            break
        }
    }

    if (cursor < closeMinutes) {
        freeIntervals.push({
            start: cursor,
            end: closeMinutes,
        })
    }

    return freeIntervals.filter((slot) => slot.end > slot.start)
}

async function updateDemoStations() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing from the backend .env file.')
    }

    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')

    const stations = await ChargingStation.find({
        stationCode: { $in: Object.keys(stationHours) },
    })

    if (stations.length === 0) {
        throw new Error(
            'No matching demo stations were found. Check stationCode values before updating.'
        )
    }

    console.log(`Found ${stations.length} matching demo stations.`)

    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    const dateKeys = []

    for (let offset = 0; offset < 7; offset++) {
        const date = new Date(today)
        date.setUTCDate(date.getUTCDate() + offset)
        dateKeys.push(date.toISOString().slice(0, 10))
    }

    for (const station of stations) {
        const hours = stationHours[station.stationCode]

        if (!hours) {
            console.log(`Skipping ${station.stationCode}: no hours configured.`)
            continue
        }

        const openMinutes = timeToMinutes(hours.open)
        const closeMinutes = timeToMinutes(hours.close)

        if (
            openMinutes < 0 ||
            closeMinutes > 1440 ||
            closeMinutes <= openMinutes
        ) {
            throw new Error(
                `Invalid hours for ${station.stationCode}: ${hours.open}-${hours.close}`
            )
        }

        const existingSlots = (station.timeSlots || []).map((slot) => ({
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            status: slot.status,
        }))

        // Keep every booked and unavailable interval exactly as stored.
        const protectedSlots = existingSlots.filter(
            (slot) => slot.status === 'booked' || slot.status === 'unavailable'
        )

        // Keep unrelated status values too, rather than silently deleting them.
        const otherStatusSlots = existingSlots.filter(
            (slot) =>
                slot.status !== 'available' &&
                slot.status !== 'booked' &&
                slot.status !== 'unavailable'
        )

        const rebuiltAvailableSlots = []

        for (const date of dateKeys) {
            const dayProtectedSlots = protectedSlots.filter(
                (slot) => dateKey(slot.date) === date
            )

            const freeIntervals = createFreeIntervals(
                openMinutes,
                closeMinutes,
                dayProtectedSlots
            )

            for (const interval of freeIntervals) {
                // Preserve partial intervals around existing bookings.
                // The frontend can merge adjacent intervals for display.
                rebuiltAvailableSlots.push({
                    date: makeDate(date),
                    startTime: minutesToTime(interval.start),
                    endTime: minutesToTime(interval.end),
                    status: 'available',
                })
            }
        }

        // Retain protected and unknown-status records on every date,
        // including dates beyond the regenerated seven-day horizon.
        station.timeSlots = [
            ...protectedSlots,
            ...otherStatusSlots,
            ...rebuiltAvailableSlots,
        ]

        // All charger entries at these demo stations should represent one port.
        if (Array.isArray(station.chargers)) {
            station.chargers = station.chargers.map((charger) => {
                const item =
                    typeof charger.toObject === 'function'
                        ? charger.toObject()
                        : { ...charger }

                item.totalPorts = 1
                return item
            })
        }

        station.openingHours = `${hours.open}-${hours.close}`

        await station.save()

        console.log(
            `Updated ${station.stationCode}: one port, ${station.openingHours}, ` +
            `${rebuiltAvailableSlots.length} available intervals.`
        )
    }

    console.log('Demo station update completed.')
}

updateDemoStations()
    .catch((error) => {
        console.error('Demo station update failed:', error.message)
        process.exitCode = 1
    })
    .finally(async () => {
        await mongoose.disconnect()
    })
