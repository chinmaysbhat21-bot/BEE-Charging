import { AMENITIES, knownAmenityKeys } from '../../../shared/amenities'
import './StationAmenities.css'

function AmenityLabel({ amenity }) {
  return <>
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={amenity.path} />
    </svg>
    <span>{amenity.label}</span>
  </>
}

export function AmenitiesPicker({ value, onChange }) {
  const selected = knownAmenityKeys(value)
  return <fieldset className="station-amenities-picker">
    <legend>Amenities Available</legend>
    <p>Select the facilities available at your charging station.</p>
    <div className="station-amenities-options">
      {AMENITIES.map(amenity => {
        const checked = selected.includes(amenity.key)
        return <button type="button" key={amenity.key} aria-pressed={checked} className="amenity-chip"
          onClick={() => onChange(checked ? selected.filter(key => key !== amenity.key) : [...selected, amenity.key])}>
          <AmenityLabel amenity={amenity} />
          {checked && <span aria-hidden="true">✓</span>}
        </button>
      })}
    </div>
  </fieldset>
}

export function StationAmenities({ value, limit = Infinity, heading = false }) {
  const selected = knownAmenityKeys(value)
  const amenities = AMENITIES.filter(amenity => selected.includes(amenity.key))
  if (!amenities.length) return null
  return <div className="station-amenities-display">
    {heading && <h3>Amenities Available</h3>}
    <ul aria-label="Station amenities">
      {amenities.slice(0, limit).map(amenity => <li className="amenity-chip" key={amenity.key}><AmenityLabel amenity={amenity} /></li>)}
      {amenities.length > limit && <li className="amenity-chip">+{amenities.length - limit} more</li>}
    </ul>
  </div>
}
