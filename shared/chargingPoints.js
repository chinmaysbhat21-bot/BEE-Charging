export const CHARGING_NETWORKS = ['Sunfuel', 'REIL', 'Torrent', 'eFill', 'Statiq', 'Powerbank', 'Vaari Energy', 'KIA', 'Other', 'HPCL']
const normalized = (value) => String(value || '').trim().toLowerCase()
export function connectorKey(value) {
  const key = normalized(value).replace(/[\s_-]/g, '')
  return ({ ccstype2: 'ccs2', ccscombo2: 'ccs2', mennekestype2: 'type2', j1772: 'type1' })[key] || key
}
export function pointCompatible(point, battery) {
  if (!battery || (point.vehicleType || 'car') !== (battery.vehicleType || 'car')) return false
  const connectors = (battery.connectorTypes?.length ? battery.connectorTypes : [battery.connectorType]).map(connectorKey)
  if (!(point.connectorTypes || []).some((value) => {
    const key = connectorKey(value)
    // Generic labels do not establish electrical compatibility.
    return key && !['other', 'unknown', 'compatiblebikeconnector'].includes(key) && connectors.includes(key)
  })) return false
  const specs = point.supportedVehicles || []
  if (!specs.length) return true
  return specs.some((spec) =>
    (!spec.make || normalized(spec.make) === normalized(battery.vehicleMake)) &&
    (!spec.model || normalized(spec.model) === normalized(battery.vehicleModel).split(' (')[0]) &&
    (spec.capacityKwh == null || Number(spec.capacityKwh) === Number(battery.capacityKwh)) &&
    (spec.batteryVoltage == null || Number(spec.batteryVoltage) === Number(battery.batteryVoltage)) &&
    (!spec.batteryChemistry || spec.batteryChemistry === 'Other/Unknown' || spec.batteryChemistry === battery.batteryChemistry))
}
export function pointView(station, point) {
  return { ...station, chargers: [point], timeSlots: point.timeSlots || station.timeSlots,
    pricing: point.pricePerKWh == null ? station.pricing : { pricingModel: 'per_kwh', pricePerKWh: point.pricePerKWh, currency: station.pricing?.currency || 'INR' } }
}

export function pointAvailable(point) {
  return point.availability === 'available' && !['PAUSED', 'SUSPENDED'].includes(point.chargeGuard?.state)
}
