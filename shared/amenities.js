export const AMENITIES = [
  ['washroom', 'Washroom', 'M4 3h6v10H4z M4 13h16a7 7 0 0 1-7 7H9v2 M4 9h6'],
  ['parking', 'Parking', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z M9 17V7h4a3 3 0 0 1 0 6H9'],
  ['cafeteria', 'Cafeteria', 'M3 8h14v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z M17 9h2a2 2 0 0 1 0 4h-2 M2 21h18 M7 3v2 M12 3v2'],
  ['restaurant', 'Restaurant', 'M3 3v5a3 3 0 0 0 6 0V3 M6 3v19 M20 22V3c-4 2-5 6-5 10h5'],
  ['wifi', 'Wi-Fi', 'M2 8a16 16 0 0 1 20 0 M5 12a11 11 0 0 1 14 0 M8 16a6 6 0 0 1 8 0 M12 20h.01'],
  ['waiting_lounge', 'Waiting Lounge', 'M5 12V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4 M5 19v2 M19 19v2 M4 19h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0v4a2 2 0 0 0 2 2Z'],
  ['drinking_water', 'Drinking Water', 'M5 3h14l-2 18H7z M6 10c2-2 4 2 6 0s4 2 6 0'],
  ['wheelchair_accessible', 'Wheelchair Accessible', 'M15 16a6 6 0 1 1-9-5 M10 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M10 8l1 7h6l3 5h2 M11 11h6'],
  ['security', 'Security', 'M12 2l8 4v6c0 5-8 10-8 10s-8-5-8-10V6z M8 12l3 3 5-6'],
  ['cctv', 'CCTV', 'M3 6h13v10H3z M16 9l5-3v10l-5-3 M9 16v4h6'],
  ['shopping', 'Shopping', 'M4 8h16l1 13H3z M8 10V6a4 4 0 0 1 8 0v4'],
  ['accommodation', 'Nearby Accommodation', 'M3 19V5 M3 16h18v3 M3 11h14a4 4 0 0 1 4 4v1 M7 11V8h4v3'],
].map(([key, label, path]) => ({ key, label, path }))

const normalize = value => value.trim().toLowerCase().replace(/[\s-]+/g, '_')
const keys = new Map(AMENITIES.flatMap(({ key, label }) => [[key, key], [normalize(label), key]]))
keys.set('restroom', 'washroom')
keys.set('wi_fi', 'wifi')
keys.set('wheelchair_accessibility', 'wheelchair_accessible')

export function amenityKey(value) {
  return typeof value === 'string' ? keys.get(normalize(value)) : undefined
}

export function knownAmenityKeys(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(amenityKey).filter(Boolean))]
}
