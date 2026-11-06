import mongoose from 'mongoose'
import { healthState } from './chargeGuard.js'
import Booking from '../models/Booking.js'
import { CHARGING_NETWORKS } from '../../shared/chargingPoints.js'

export const reject = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }) }
export function validateNetwork(body) {
  const chargingNetwork = body.chargingNetwork ?? ''
  if (typeof chargingNetwork !== 'string' || (chargingNetwork && !CHARGING_NETWORKS.includes(chargingNetwork))) reject('Choose a valid charging network.')
  const otherNetworkName = chargingNetwork === 'Other' ? String(body.otherNetworkName || '').trim() : ''
  if (chargingNetwork === 'Other' && (!otherNetworkName || otherNetworkName.length > 100)) reject('Enter the other network name (up to 100 characters).')
  return { chargingNetwork, otherNetworkName }
}
export function validatePoints(points, existing = []) {
  if (!Array.isArray(points) || !points.length || points.length > 50) reject('Add between 1 and 50 charging points.')
  const ids = new Set(), names = new Set()
  return points.map((point) => {
    if (!point || typeof point !== 'object') reject('Invalid charging point.')
    const name = typeof point.name === 'string' ? point.name.trim() : ''
    if (!name || name.length > 100 || names.has(name.toLowerCase())) reject('Every charging point needs a distinct name (up to 100 characters).')
    names.add(name.toLowerCase())
    if (!['car', 'bike'].includes(point.vehicleType)) reject('Choose a vehicle category for each point.')
    if (!['AC', 'DC'].includes(point.chargingMode)) reject('Choose AC or DC for each point.')
    if (!['available', 'offline', 'maintenance'].includes(point.availability)) reject('Choose a valid point availability.')
    for (const field of ['powerOutputKW', 'pricePerKWh', 'totalPorts']) {
      if (point[field] === '' || point[field] == null || !Number.isFinite(Number(point[field]))) reject(`Enter a valid ${field}.`)
    }
    if (Number(point.powerOutputKW) < 0.1 || Number(point.pricePerKWh) < 0 || !Number.isInteger(Number(point.totalPorts)) || Number(point.totalPorts) < 1 || Number(point.totalPorts) > 20) reject('Check power, price and socket count.')
    if (!Array.isArray(point.connectorTypes) || !point.connectorTypes.length || point.connectorTypes.length > 20 || point.connectorTypes.some((c) => typeof c !== 'string' || !c.trim() || c.length > 100)) reject('Provide specific connector types for each point.')
    const id = point._id ? String(point._id) : new mongoose.Types.ObjectId().toString()
    if (!mongoose.isValidObjectId(id) || ids.has(id) || (point._id && !existing.some((p) => String(p._id) === id))) reject('Invalid or duplicated charging point identity.')
    ids.add(id)
    if (point.supportedVehicles != null && (!Array.isArray(point.supportedVehicles) || point.supportedVehicles.length > 100)) reject('Invalid supported vehicle list.')
    const supportedVehicles = (point.supportedVehicles || []).map((spec) => {
      if (!spec || typeof spec !== 'object') reject('Invalid battery specification.')
      const result = {}
      for (const field of ['make', 'model']) {
        if (spec[field] != null && (typeof spec[field] !== 'string' || spec[field].length > 100)) reject('Invalid supported make or model.')
        result[field] = (spec[field] || '').trim()
      }
      for (const field of ['capacityKwh', 'batteryVoltage']) {
        if (spec[field] != null && spec[field] !== '') {
          const value = Number(spec[field]); if (!Number.isFinite(value) || value < 0.1) reject('Battery capacity and voltage must be positive.')
          result[field] = value
        }
      }
      result.batteryChemistry = spec.batteryChemistry || 'Other/Unknown'
      if (!['LFP', 'NMC', 'Other/Unknown'].includes(result.batteryChemistry)) reject('Invalid battery chemistry.')
      if (!result.make && !result.model && !result.capacityKwh && !result.batteryVoltage && result.batteryChemistry === 'Other/Unknown') reject('Enter a supported model or battery specification, or remove the empty row.')
      return result
    })
    const previous = existing.find((p) => String(p._id) === id)
    return { ...(previous?.toObject ? previous.toObject() : previous || {}), _id: id, name, vehicleType: point.vehicleType, chargingMode: point.chargingMode, chargerType: previous?.chargingMode === point.chargingMode ? previous.chargerType : point.chargingMode,
      availability: point.availability, powerOutputKW: Number(point.powerOutputKW), pricePerKWh: Number(point.pricePerKWh), totalPorts: Number(point.totalPorts),
      connectorTypes: [...new Set(point.connectorTypes.map((c) => c.trim()))], supportedVehicles }
  })
}
const key = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export function baseWindows(station, date) {
  if (station.timeSlots?.length) return station.timeSlots.filter((s) => key(new Date(s.date)) === date && s.status === 'available').map((s) => [s.startTime, s.endTime])
  return [String(station.openingHours || '00:00-23:59').split('-')]
}
export async function stationViews(stations) {
  const now = new Date()
  const bookings = await Booking.find({ station: { $in: stations.map((s) => s._id) }, status: 'confirmed', endAt: { $gt: now } }).select('station chargingPointId startAt endAt date startTime endTime').lean()
  return stations.map((document) => {
    const station = document.toObject()
    if (!station.pointBookingEnabled) return station
    const owned = bookings.filter((b) => String(b.station) === String(station._id))
    station.chargers = station.chargers.map((point) => {
      const blocks = owned.filter((b) => !b.chargingPointId || String(b.chargingPointId) === String(point._id))
      const timeSlots = []
      for (let day = 0; day < 31; day++) {
        const dayDate = new Date(now); dayDate.setDate(dayDate.getDate() + day); dayDate.setHours(0, 0, 0, 0)
        const date = key(dayDate)
        let windows = baseWindows(station, date)
        for (const b of blocks.filter((b) => b.date === date)) windows = windows.flatMap(([a, z]) => {
          if (b.endTime <= a || b.startTime >= z) return [[a, z]]
          return [...(a < b.startTime ? [[a, b.startTime]] : []), ...(z > b.endTime ? [[b.endTime, z]] : [])]
        })
        if (point.availability === 'available' && !['PAUSED', 'SUSPENDED'].includes(healthState(point)) && station.status === 'available' && !['PAUSED', 'SUSPENDED'].includes(healthState(station))) for (const [startTime, endTime] of windows) timeSlots.push({ date: dayDate.toISOString(), startTime, endTime, status: 'available' })
      }
      return { ...point, chargeGuard: { ...point.chargeGuard, state: healthState(point) }, occupied: blocks.some((b) => b.startAt <= now && b.endAt > now), timeSlots }
    })
    return station
  })
}
export async function protectPointChanges(station, points, session) {
  const future = await Booking.find({ station: station._id, status: 'confirmed', endAt: { $gt: new Date() } }).session(session)
  for (const old of station.chargers) {
    const next = points.find((p) => String(p._id) === String(old._id))
    if (!next) {
      if (await Booking.exists({ station: station._id, $or: [{ chargingPointId: old._id }, { chargingPointId: null }] }).session(session)) reject('A point with booking history cannot be removed. Mark it offline instead.', 409)
    } else if (future.some((b) => !b.chargingPointId || String(b.chargingPointId) === String(old._id))) {
      for (const field of ['vehicleType', 'chargingMode', 'powerOutputKW', 'pricePerKWh', 'connectorTypes', 'supportedVehicles', 'totalPorts']) {
        const previous = old.toObject()[field] ?? (field === 'pricePerKWh' ? station.pricing.pricePerKWh : undefined)
        if (JSON.stringify(previous) !== JSON.stringify(next[field])) reject('Specifications and prices cannot change while this point has active or upcoming bookings. Availability may still be changed.', 409)
      }
    }
  }
}
