import mongoose from 'mongoose'
import express from 'express'
import ChargingStation from '../models/ChargingStation.js'
import Booking from '../models/Booking.js'
import { validatePoints, validateNetwork, stationViews, protectPointChanges } from '../services/chargingPoints.js'

import { amenityKey } from '../../shared/amenities.js'

const router = express.Router()

function validateAmenities(value = []) {
    const values = typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : value
    if (!Array.isArray(values) || values.length > 50 || values.some(item => !amenityKey(item))) {
        throw Object.assign(new Error('Select only supported station amenities.'), { statusCode: 400 })
    }
    return [...new Set(values.map(amenityKey))]
}

// GET /api/charging-stations
router.get('/', async (req, res) => {
    try {
        const stations = await ChargingStation.find({
            status: 'available',
        }).sort({ name: 1 })

        res.status(200).json({
            success: true,
            count: stations.length,
            stations: await stationViews(stations),
        })
    } catch (error) {
        console.error('Error fetching charging stations:', error.message)

        res.status(500).json({
            success: false,
            message: 'Failed to fetch charging stations.',
        })
    }
})

// GET /api/charging-stations/my
// Fetch only the logged-in host's charging stations
router.get('/my', async (req, res) => {
    try {
        const hostId = req.session?.consumerId

        if (!hostId) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to view your charging stations.',
            })
        }

        const stations = await ChargingStation.find({
            hostId,
        }).sort({ name: 1 })

        return res.status(200).json({
            success: true,
            count: stations.length,
            stations: await stationViews(stations),
        })
    } catch (error) {
        console.error('Error fetching host charging stations:', error.message)

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch your charging stations.',
        })
    }
})

router.post('/', async (req, res) => {
    try {
        if (!req.session?.consumerId) return res.status(401).json({ message: 'Please log in.' })
        const points = req.body.chargingPoints === undefined ? null : validatePoints(req.body.chargingPoints)
        const network = validateNetwork(req.body)
        if (points) {
            const first = points[0]
            req.body = { ...req.body, chargerType: first.chargingMode, connectorTypes: first.connectorTypes, powerOutputKW: first.powerOutputKW, totalPorts: first.totalPorts, pricePerKwh: first.pricePerKWh }
        }
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.openingTime || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.closingTime || '') || req.body.openingTime >= req.body.closingTime) return res.status(400).json({ message: 'Enter valid same-day opening and closing times.' })
        const {
            name,
            address,
            area,
            city,
            state,
            pincode,
            stationType,
            description,
            openingTime,
            closingTime,
            chargerType,
            connectorTypes,
            powerOutputKW,
            totalPorts,
            pricePerKwh,
            amenities,
            latitude,
            longitude,
        } = req.body

        // Validate required form fields.
        if (
            !name?.trim() ||
            !address?.trim() ||
            !city?.trim() ||
            !state?.trim() ||
            !pincode?.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: 'Please complete all required address and station fields.',
            })
        }

        const lat = Number(latitude)
        const lng = Number(longitude)
        const power = Number(powerOutputKW)
        const ports = Number(totalPorts)
        const price = Number(pricePerKwh)

        if (
            latitude == null || String(latitude).trim() === '' ||
            longitude == null || String(longitude).trim() === '' ||
            !Number.isFinite(lat) ||
            lat < -90 ||
            lat > 90 ||
            !Number.isFinite(lng) ||
            lng < -180 ||
            lng > 180
        ) {
            return res.status(400).json({
                success: false,
                message: 'Use Current Location or enter valid latitude and longitude before saving.',
            })
        }

        if (
            !Number.isFinite(power) ||
            power < 0.1 ||
            !Number.isInteger(ports) ||
            ports < 1 ||
            !Number.isFinite(price) ||
            price < 0
        ) {
            return res.status(400).json({
                success: false,
                message: 'Check the power output, port count, and price.',
            })
        }

        const validStationTypes = [
            'public',
            'business',
            'residential',
            'private_hosted',
        ]

        const requestedStationType = stationType === 'commercial' ? 'business' : stationType
        const normalizedStationType = validStationTypes.includes(requestedStationType)
            ? requestedStationType
            : null

        if (!normalizedStationType) {
            return res.status(400).json({
                success: false,
                message: 'Invalid station type.',
            })
        }

        const validChargerTypes = [
            'portable',
            'wallbox',
            'AC',
            'DC',
            'other',
        ]

        if (!validChargerTypes.includes(chargerType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid charger type.',
            })
        }

        const normalizedConnectors = Array.isArray(connectorTypes)
            ? connectorTypes
            : String(connectorTypes || '')
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)

        if (normalizedConnectors.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide at least one connector type.',
            })
        }

        // Generate a unique station code on the backend.
        const lastStation = await ChargingStation.findOne({
            stationCode: /^HOST-DEMO-\d+$/,
        }).sort({ createdAt: -1 })

        const lastNumber = lastStation
            ? Number(lastStation.stationCode.match(/\d+$/)?.[0] || 0)
            : 0

        let stationCode
        let codeExists = true
        let nextNumber = lastNumber + 1

        while (codeExists) {
            stationCode = `HOST-DEMO-${String(nextNumber).padStart(3, '0')}`
            codeExists = Boolean(
                await ChargingStation.exists({ stationCode })
            )
            nextNumber += 1
        }

        const hostId = req.session?.consumerId

        if (!hostId || !mongoose.isValidObjectId(hostId)) {
            return res.status(401).json({
                success: false,
                message: 'Please log in before adding a charging station.',
            })
        }

        const normalizedChargerType = chargerType
        const chargingMode =
            normalizedChargerType === 'DC' ? 'DC' : 'AC'

        const station = await ChargingStation.create({
            name: name.trim(),
            stationCode,
            address: [address.trim(), area, city, state, pincode]
                .filter(Boolean)
                .join(', '),
            area: area || '',
            description: description || '',
            stationType: normalizedStationType,
            location: {
                type: 'Point',
                coordinates: [lng, lat],
            },
            hostId,
            ...network,
            pointBookingEnabled: Boolean(points),
            chargers: points || [
                {
                    chargerType: normalizedChargerType,
                    chargingMode,
                    connectorTypes: normalizedConnectors,
                    powerOutputKW: power,
                    totalPorts: ports,
                },
            ],
            pricing: {
                pricingModel: 'per_kwh',
                pricePerKWh: price,
                currency: 'INR',
            },
            openingHours: `${openingTime}-${closingTime}`,
            amenities: validateAmenities(amenities),
            status: 'available',
            timeSlots: [],
            isDemo: false,
        })

        return res.status(201).json({
            success: true,
            message: 'Charging station saved successfully.',
            station,
        })
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message })
        console.error('Error creating charging station:', error)

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'A station with this code already exists. Please try again.',
            })
        }

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: error.message,
            })
        }

        return res.status(500).json({
            success: false,
            message: 'Failed to save charging station.',
        })
    }
})


/**
 * DELETE /api/charging-stations/:id
 * Delete a host's charging station only if it has no bookings.
 */
router.delete('/:id', async (req, res) => {
    if (!req.session?.consumerId) return res.status(401).json({ message: 'Please log in before deleting a charging station.' })
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid charging station ID.' })
    try {
        await mongoose.connection.transaction(async (session) => {
            const station = await ChargingStation.findOne({ _id: req.params.id, hostId: req.session.consumerId }).session(session)
            if (!station) throw Object.assign(new Error('Station not found.'), { statusCode: 404 })
            if (await Booking.exists({ station: station._id }).session(session)) throw Object.assign(new Error('This station has booking history and cannot be deleted.'), { statusCode: 409 })
            await ChargingStation.deleteOne({ _id: station._id, hostId: req.session.consumerId }, { session })
        })
        res.json({ success: true, message: 'Charging station deleted successfully.' })
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Unable to delete station.' })
    }
})

router.put('/:id/points', async (req, res) => {
    if (!req.session?.consumerId) return res.status(401).json({ message: 'Please log in.' })
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid station ID.' })
    try {
        const amenitiesOnly = req.body.chargingPoints === undefined && req.body.amenities !== undefined &&
            req.body.chargingNetwork === undefined && req.body.otherNetworkName === undefined
        const station = await mongoose.connection.transaction(async (session) => {
            const owned = await ChargingStation.findOne({ _id: req.params.id, hostId: req.session.consumerId }).session(session)
            if (!owned) throw Object.assign(new Error('Station not found.'), { statusCode: 404 })
            if (req.body.amenities !== undefined) owned.amenities = validateAmenities(req.body.amenities)
            if (amenitiesOnly) {
                await owned.save({ session })
                return owned
            }
            const points = validatePoints(req.body.chargingPoints, owned.chargers)
            await protectPointChanges(owned, points, session)
            owned.chargers = points
            owned.pointBookingEnabled = true
            Object.assign(owned, validateNetwork(req.body))
            await owned.save({ session })
            return owned
        })
        res.json({ station, message: amenitiesOnly ? 'Amenities saved.' : 'Charging points saved.' })
    } catch (error) {
        res.status(error.statusCode || (error.name === 'ValidationError' ? 400 : 500)).json({ message: error.statusCode || error.name === 'ValidationError' ? error.message : 'Unable to save charging points.' })
    }
})

export default router
