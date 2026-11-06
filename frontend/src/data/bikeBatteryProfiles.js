// Capacities are variant-specific. Charging limits and connectors require owner confirmation.
const bike = (id, make, model, capacities = [], source = '') => ({
  id, make, model, vehicleType: 'bike', searchTerms: [make, model],
  batteryChemistry: 'Other/Unknown', connectorTypes: [], verificationStatus: 'unverified',
  summary: capacities.length ? `${capacities.join(' / ')} kWh · confirm your variant` : 'Battery capacity varies by variant — enter your exact specifications',
  specificationNotes: [{ status: 'variant', text: 'Confirm the exact model year, capacity, connector and charging input limit from your owner manual. Motor output power is not charging power. Illustration is generic.' }],
  sources: source ? [{ label: 'Manufacturer specifications', url: source }] : [],
  variants: capacities.map((capacityKwh) => ({ id: `${capacityKwh}-kwh`, label: `${capacityKwh} kWh pack`, capacityKwh })),
})
export const BIKE_BATTERY_PROFILES = [
  bike('ola-s1-pro', 'Ola', 'S1 Pro'),
  bike('tvs-iqube', 'TVS', 'iQube', [3.5], 'https://www.tvsmotor.com/electric-scooters/tvs-iqube/tvs-iqube-3-5-kwh-variant-details'),
  bike('ather-rizta', 'Ather', 'Rizta', [2.7, 2.9, 3.7], 'https://media.atherenergy.com/Rizta_specifications.pdf'),
  bike('bajaj-chetak', 'Bajaj', 'Chetak', [3.5], 'https://www.chetak.com/series-35/chetak-c3501'),
  bike('hero-vida-v2', 'Hero', 'Vida V2', [2.2, 3.44, 3.94], 'https://www.vidaworld.com/content/dam/vida2-0/product-list-pages/desktop/vida-2/Vida_V2_Spec_Sheet.pdf'),
]
