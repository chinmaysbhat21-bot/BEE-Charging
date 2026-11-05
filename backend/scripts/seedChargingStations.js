
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import ChargingStation from '../models/ChargingStation.js'

dotenv.config()

// Illustrative demo operating hours for each station.
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


function generateTimeSlots(days = 7, openingTime = '06:00', closingTime = '22:00') {
    const slots = []
    const now = new Date()

    const openMinutes = timeToMinutes(openingTime)
    const closeMinutes = timeToMinutes(closingTime)

    if (
        closeMinutes <= openMinutes ||
        openMinutes < 0 ||
        closeMinutes > 24 * 60
    ) {
        throw new Error(`Invalid operating hours: ${openingTime}-${closingTime}`)
    }

    for (let dayOffset = 0; dayOffset < days; dayOffset++) {
        const date = new Date(now)
        date.setDate(date.getDate() + dayOffset)
        date.setHours(0, 0, 0, 0)

        slots.push({
            date: new Date(date),
            startTime: openingTime,
            endTime: closingTime,
            status: 'available',
        })
    }

    return slots
}


const stations = [
    {
        name: 'Railway Station Community Charger',
        stationCode: 'ATP-DEMO-001',
        stationType: 'business',
        address: 'Anantapur Railway Station, Anantapur, Andhra Pradesh',
        area: 'Railway Station',
        location: { type: 'Point', coordinates: [77.59514, 14.68637] },
        chargers: [{
            chargerType: 'DC',
            chargingMode: 'DC',
            connectorTypes: ['CCS2'],
            powerOutputKW: 60,
            voltageV: 400,
            currentA: 150,
            phase: 'not_applicable',
            totalPorts: 1,
        }],
        pricing: { pricingModel: 'per_kwh', pricePerKWh: 18, currency: 'INR' },
    },
    {
        name: 'APSRTC Bus Stand Community Charger',
        stationCode: 'ATP-DEMO-002',
        stationType: 'business',
        address: 'APSRTC Bus Station, Anantapur, Andhra Pradesh',
        area: 'Bus Stand',
        location: { type: 'Point', coordinates: [77.59996, 14.68530] },
        chargers: [{
            chargerType: 'DC',
            chargingMode: 'DC',
            connectorTypes: ['CCS2'],
            powerOutputKW: 30,
            voltageV: 400,
            currentA: 75,
            phase: 'not_applicable',
            totalPorts: 1,
        }],
        pricing: { pricingModel: 'per_kwh', pricePerKWh: 16, currency: 'INR' },
    },
    {
        name: 'Clock Tower Community Charger',
        stationCode: 'ATP-DEMO-003',
        stationType: 'business',
        address: 'Clock Tower, Anantapur, Andhra Pradesh',
        area: 'Clock Tower',
        location: { type: 'Point', coordinates: [77.59611, 14.68061] },
        chargers: [{
            chargerType: 'AC',
            chargingMode: 'AC',
            connectorTypes: ['Type 2'],
            powerOutputKW: 7.2,
            voltageV: 230,
            currentA: 32,
            phase: 'single',
            totalPorts: 1,
        }],
        pricing: { pricingModel: 'per_kwh', pricePerKWh: 10, currency: 'INR' },
    },
    {
        name: 'ISKCON Community Charger',
        stationCode: 'ATP-DEMO-004',
        stationType: 'business',
        address: 'ISKCON Temple area, Somaladoddi, Anantapur, Andhra Pradesh',
        area: 'Somaladoddi',
        location: { type: 'Point', coordinates: [77.58, 14.70] },
        chargers: [{
            chargerType: 'DC',
            chargingMode: 'DC',
            connectorTypes: ['CCS2'],
            powerOutputKW: 50,
            voltageV: 400,
            currentA: 125,
            phase: 'not_applicable',
            totalPorts: 1,
        }],
        pricing: { pricingModel: 'per_kwh', pricePerKWh: 17, currency: 'INR' },
    },
    {
        name: 'Shopping Mall Community Charger',
        stationCode: 'ATP-DEMO-005',
        stationType: 'business',
        address: 'Subash Road, near Saptagiri Circle, Anantapur, Andhra Pradesh',
        area: 'Saptagiri Circle',
        location: { type: 'Point', coordinates: [77.594, 14.681] },
        chargers: [{
            chargerType: 'wallbox',
            chargingMode: 'AC',
            connectorTypes: ['Type 2'],
            powerOutputKW: 11,
            voltageV: 400,
            currentA: 16,
            phase: 'three',
            totalPorts: 1,
        }],
        pricing: { pricingModel: 'per_kwh', pricePerKWh: 12, currency: 'INR' },
    },
    {
        name: 'Care and Cure Community Charger',
        stationCode: 'ATP-DEMO-006',
        stationType: 'business',
        address: 'RTC Bus Stand Road, Anantapur, Andhra Pradesh',
        area: 'RTC Bus Stand Road',
        location: { type: 'Point', coordinates: [77.602, 14.686] },
        chargers: [{
            chargerType: 'portable',
            chargingMode: 'AC',
            connectorTypes: ['Type 2'],
            powerOutputKW: 3.3,
            voltageV: 230,
            currentA: 16,
            phase: 'single',
            totalPorts: 1,
        }],
        pricing: { pricingModel: 'per_kwh', pricePerKWh: 9, currency: 'INR' },
    },
    {
        name: 'Government Hospital Community Charger',
        stationCode: 'ATP-DEMO-007',
        stationType: 'business',
        address: 'Government General Hospital area, Anantapur, Andhra Pradesh',
        area: 'Gulzarpet',
        location: { type: 'Point', coordinates: [77.598, 14.683] },
        chargers: [{
            chargerType: 'DC',
            chargingMode: 'DC',
            connectorTypes: ['CCS2'],
            powerOutputKW: 25,
            voltageV: 400,
            currentA: 63,
            phase: 'not_applicable',
            totalPorts: 1,
        }],
        pricing: { pricingModel: 'per_kwh', pricePerKWh: 15, currency: 'INR' },
    },
    {
        name: 'YSR Memorial Area Community Charger',
        stationCode: 'ATP-DEMO-008',
        stationType: 'business',
        address: 'Ashok Nagar area, Anantapur, Andhra Pradesh',
        area: 'Ashok Nagar',
        location: { type: 'Point', coordinates: [77.592, 14.677] },
        chargers: [{
            chargerType: 'wallbox',
            chargingMode: 'AC',
            connectorTypes: ['Type 2'],
            powerOutputKW: 7.2,
            voltageV: 230,
            currentA: 32,
            phase: 'single',
            totalPorts: 1,
        }],
        pricing: { pricingModel: 'per_kwh', pricePerKWh: 11, currency: 'INR' },
    },
    {
        name: 'JNTU Community Charger',
        stationCode: 'ATP-DEMO-009',
        stationType: 'business',
        address: 'JNTU Anantapur area, Andhra Pradesh',
        area: 'JNTU',
        location: { type: 'Point', coordinates: [77.601, 14.659] },
        chargers: [{
            chargerType: 'DC',
            chargingMode: 'DC',
            connectorTypes: ['CCS2'],
            powerOutputKW: 60,
            voltageV: 400,
            currentA: 150,
            phase: 'not_applicable',
            totalPorts: 1,
        }],
        pricing: { pricingModel: 'per_kwh', pricePerKWh: 19, currency: 'INR' },
    },
    {
        name: 'Iron Bridge Community Charger',
        stationCode: 'ATP-DEMO-010',
        stationType: 'business',
        address: 'Iron Bridge area, Subash Road, Anantapur, Andhra Pradesh',
        area: 'Subash Road',
        location: { type: 'Point', coordinates: [77.590, 14.682] },
        chargers: [{
            chargerType: 'AC',
            chargingMode: 'AC',
            connectorTypes: ['Type 2'],
            powerOutputKW: 7.2,
            voltageV: 230,
            currentA: 32,
            phase: 'single',
            totalPorts: 1,
        }],
        pricing: { pricingModel: 'per_kwh', pricePerKWh: 10, currency: 'INR' },
    },
    {
        name: 'Kamalanagar Home Host Charger',
        stationCode: 'ATP-DEMO-011',
        stationType: 'residential',
        address: 'Kamalanagar, Anantapur, Andhra Pradesh',
        area: 'Kamalanagar',
        location: { type: 'Point', coordinates: [77.597, 14.674] },
        chargers: [{
            chargerType: 'wallbox',
            chargingMode: 'AC',
            connectorTypes: ['Type 2'],
            powerOutputKW: 7.2,
            voltageV: 230,
            currentA: 32,
            phase: 'single',
            totalPorts: 1,
        }],
        pricing: { pricingModel: 'per_kwh', pricePerKWh: 8, currency: 'INR' },
    },
    {
        name: 'Sai Nagar Home Host Charger',
        stationCode: 'ATP-DEMO-012',
        stationType: 'private_hosted',
        address: 'Sai Nagar, Anantapur, Andhra Pradesh',
        area: 'Sai Nagar',
        location: { type: 'Point', coordinates: [77.588, 14.675] },
        chargers: [{
            chargerType: 'portable',
            chargingMode: 'AC',
            connectorTypes: ['Type 2'],
            powerOutputKW: 3.3,
            voltageV: 230,
            currentA: 16,
            phase: 'single',
            totalPorts: 1,
        }],
        pricing: { pricingModel: 'per_kwh', pricePerKWh: 7, currency: 'INR' },
    },
    {
        name: 'Old Town Community Charger',
        stationCode: 'ATP-DEMO-013',
        stationType: 'business',
        address: 'Old Town area, Anantapur, Andhra Pradesh',
        area: 'Old Town',
        location: { type: 'Point', coordinates: [77.605, 14.679] },
        chargers: [{
            chargerType: 'DC',
            chargingMode: 'DC',
            connectorTypes: ['CCS2'],
            powerOutputKW: 30,
            voltageV: 400,
            currentA: 75,
            phase: 'not_applicable',
            totalPorts: 1,
        }],
        pricing: { pricingModel: 'per_kwh', pricePerKWh: 16, currency: 'INR' },
    },
    {
        name: 'Srinivasa Nagar Home Host Charger',
        stationCode: 'ATP-DEMO-014',
        stationType: 'residential',
        address: 'Srinivasa Nagar, Anantapur, Andhra Pradesh',
        area: 'Srinivasa Nagar',
        location: { type: 'Point', coordinates: [77.604, 14.689] },
        chargers: [{
            chargerType: 'wallbox',
            chargingMode: 'AC',
            connectorTypes: ['Type 2'],
            powerOutputKW: 11,
            voltageV: 400,
            currentA: 16,
            phase: 'three',
            totalPorts: 1,
        }],
        pricing: { pricingModel: 'per_kwh', pricePerKWh: 9, currency: 'INR' },
    },
    {
        name: 'Tapovanam Community Charger',
        stationCode: 'ATP-DEMO-015',
        stationType: 'private_hosted',
        address: 'Tapovanam area, Anantapur, Andhra Pradesh',
        area: 'Tapovanam',
        location: { type: 'Point', coordinates: [77.615, 14.692] },
        chargers: [{
            chargerType: 'DC',
            chargingMode: 'DC',
            connectorTypes: ['CCS2'],
            powerOutputKW: 50,
            voltageV: 400,
            currentA: 125,
            phase: 'not_applicable',
            totalPorts: 1,
        }],
        pricing: { pricingModel: 'per_kwh', pricePerKWh: 18, currency: 'INR' },
    },
]

async function seedChargingStations() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing from the backend .env file.')
    }

    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')

    for (const station of stations) {
        const hours = stationHours[station.stationCode]

        await ChargingStation.findOneAndUpdate(
            { stationCode: station.stationCode },
            {
                $set: {
                    ...station,
                    status: 'available',
                    openingHours: `${hours.open}-${hours.close}`,
                    amenities: [],
                    isDemo: true,
                    timeSlots: generateTimeSlots(7, hours.open, hours.close),
                },
            },
            { upsert: true, runValidators: true }
        )
    }

    console.log(
        `Seeded ${stations.length} demo charging stations with individual operating hours.`
    )
}

seedChargingStations()
    .catch((error) => {
        console.error('Seeding failed:', error.message)
        process.exitCode = 1
    })
    .finally(async () => {
        await mongoose.disconnect()
    })
