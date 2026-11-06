import './VehicleTypeSelector.css'

export function BikeIllustration() {
  return <svg className="vehicle-bike-art" viewBox="0 0 160 80" role="img" aria-label="Electric scooter illustration"><g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><circle cx="35" cy="60" r="14"/><circle cx="126" cy="60" r="14"/><path d="M22 48h43l9 12h30l13-36-7-12h-12M117 24h12M35 60l18-27h30M48 30h35M64 48V33M117 24l9 36"/></g><path d="m88 31-7 12h7l-3 11 12-16h-8l5-7" fill="currentColor"/></svg>
}
export function VehicleTypeSelector({ value, onChange }) {
  return <div className="vehicle-types" role="group" aria-label="Vehicle type">{['bike', 'car'].map((type) => <button type="button" key={type} aria-pressed={value === type} className="vehicle-type-card" onClick={() => onChange(type)}>
    {type === 'bike' ? <BikeIllustration /> : <svg viewBox="0 0 160 80" className="vehicle-bike-art" role="img" aria-label="Electric car illustration"><g fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"><path d="M20 55V39l20-8 14-18h48l20 23 18 6v15h-15M45 57h55M40 31h82M76 14v18"/><circle cx="33" cy="57" r="12"/><circle cx="112" cy="57" r="12"/></g></svg>}
    <strong>Electric {type === 'bike' ? 'Bike' : 'Car'}</strong><span>Add your electric {type}</span>
  </button>)}</div>
}
