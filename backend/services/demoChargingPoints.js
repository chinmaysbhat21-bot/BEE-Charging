import { createHash } from 'node:crypto'
import ChargingStation from '../models/ChargingStation.js'
import { CHARGING_NETWORKS } from '../../shared/chargingPoints.js'
import { reject, protectPointChanges } from './chargingPoints.js'

const stableId = (key) => createHash('sha256').update(key).digest('hex').slice(0, 24)
export function prepareDemoStations(rows) {
  if (!Array.isArray(rows) || rows.length !== 15) reject('The Mangalore list must contain exactly 15 stations.')
  const codes = new Set()
  return rows.map((row, index) => {
    if (!/^MLR-DEMO-\d{3}$/.test(row.stationCode || '') || codes.has(row.stationCode)) reject('Provide 15 distinct MLR-DEMO-xxx station codes.')
    codes.add(row.stationCode)
    for (const field of ['name', 'address', 'area']) if (typeof row[field] !== 'string' || !row[field].trim()) reject(`Missing ${field} in the Mangalore list.`)
    if (!Array.isArray(row.coordinates) || row.coordinates.length !== 2 || row.coordinates.some((c) => typeof c !== 'number' || !Number.isFinite(c)) || Math.abs(row.coordinates[0]) > 180 || Math.abs(row.coordinates[1]) > 90) reject('Supply unchanged [longitude, latitude] coordinates for every station.')
    const chargers = []
    const count = 2 + index % 3
    for (let i = 0; i < count; i++) {
      const bike = i === count - 1 || (count === 4 && i === count - 2)
      chargers.push({ _id: stableId(`${row.stationCode}:point:${i}`), name: `${bike ? 'Bike' : 'Car'} Point ${i + 1}`, vehicleType: bike ? 'bike' : 'car',
        chargerType: bike || i % 2 ? 'AC' : 'DC', chargingMode: bike || i % 2 ? 'AC' : 'DC',
        powerOutputKW: bike ? 3.3 : i % 2 ? 7.4 : [30, 60, 50][index % 3],
        // Bike points are power outlets requiring the owner's compatible OEM charger, not universal battery plugs.
        connectorTypes: [bike ? '3-pin 230V AC (own OEM charger)' : i % 2 ? 'Type 2' : 'CCS2'],
        pricePerKWh: bike ? 8 + index % 3 : 14 + index % 5, totalPorts: 1, availability: 'available', supportedVehicles: [],
      })
    }
    return { stationCode: row.stationCode, name: row.name.trim(), address: row.address.trim(), area: row.area.trim(),
      location: { type: 'Point', coordinates: row.coordinates }, stationType: 'public', pointBookingEnabled: true,
      description: 'Fictional demonstration station. Location, operator affiliation and charging equipment are not verified real-world facilities. Bike outlets require an owner-supplied compatible OEM charger.',
      chargingNetwork: CHARGING_NETWORKS.filter((n) => n !== 'Other')[index % 9], chargers,
      pricing: { pricingModel: 'per_kwh', pricePerKWh: chargers[0].pricePerKWh, currency: 'INR' },
      openingHours: '06:00-23:00', status: 'available', isDemo: true, timeSlots: [],
    }
  })
}
export async function importDemoStations(rows, connection) {
  const stations = prepareDemoStations(rows)
  await connection.transaction(async (session) => {
    for (const data of stations) {
      const existing = await ChargingStation.findOne({ stationCode: data.stationCode }).session(session)
      if (!existing) { await ChargingStation.create([data], { session }); continue }
      if (!existing.isDemo || existing.hostId) reject(`Refusing to modify user-managed station ${data.stationCode}.`, 409)
      if (JSON.stringify(existing.location.coordinates) !== JSON.stringify(data.location.coordinates)) reject(`Coordinates differ for ${data.stationCode}; no coordinates were changed.`, 409)
      if (existing.pointBookingEnabled) continue // Preserve subsequent edits and IDs on repeat runs.
      const points = existing.chargers.map((p, i) => ({ ...p.toObject(), name: p.name || `Car Point ${i + 1}`, pricePerKWh: p.pricePerKWh ?? existing.pricing.pricePerKWh }))
      for (const point of data.chargers) if (!points.some((p) => String(p._id) === String(point._id))) points.push(point)
      await protectPointChanges(existing, points, session)
      existing.chargers = points; existing.pointBookingEnabled = true; existing.chargingNetwork = data.chargingNetwork
      await existing.save({ session })
    }
  })
  return stations.length
}
