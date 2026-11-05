import mongoose from 'mongoose'
import express from 'express'
import ChargingStation from '../models/ChargingStation.js'
import Booking from '../models/Booking.js'

const router = express.Router()

// GET /api/charging-stations
router.get('/', async (req, res) => {
    try {
        const stations = await ChargingStation.find({
            status: 'available',
        }).sort({ name: 1 })

        res.status(200).json({
            success: true,
            count: stations.length,
            stations,
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
            stations,
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
            !Number.isFinite(lat) ||
            lat < -90 ||
            lat > 90 ||
            !Number.isFinite(lng) ||
            lng < -180 ||
            lng > 180
        ) {
            return res.status(400).json({
                success: false,
                message: 'Valid latitude and longitude are required. Find coordinates before saving.',
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

        const normalizedStationType = validStationTypes.includes(stationType)
            ? stationType
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
            chargers: [
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
            amenities: Array.isArray(amenities)
                ? amenities
                : String(amenities || '')
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
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
    try {
        const hostId = req.session?.consumerId
        const { id } = req.params

        // 1. Verify that the host is logged in.
        if (!hostId || !mongoose.isValidObjectId(hostId)) {
            return res.status(401).json({
                success: false,
                message: 'Please log in before deleting a charging station.',
            })
        }

        // 2. Validate the station ID.
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid charging station ID.',
            })
        }

        // 3. Find a station belonging to this host only.
        const station = await ChargingStation.findOne({
            _id: id,
            hostId,
        })

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found or you do not have permission to delete it.',
            })
        }

        // 4. Prevent deletion if any booking references this station.
        // Import Booking at the top of this file.
        const hasBookings = await Booking.exists({
            stationId: station._id,
        })

        if (hasBookings) {
            return res.status(409).json({
                success: false,
                message: 'This charging station cannot be deleted because it has booking records.',
            })
        }

        // 5. Delete the station only after all checks pass.
        await ChargingStation.deleteOne({
            _id: station._id,
            hostId,
        })

        return res.status(200).json({
            success: true,
            message: 'Charging station deleted successfully.',
        })
    } catch (error) {
        console.error('Error deleting charging station:', error)

        return res.status(500).json({
            success: false,
            message: 'Failed to delete charging station.',
        })
    }
})

export default router
