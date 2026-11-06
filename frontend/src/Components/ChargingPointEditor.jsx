import { AmenitiesPicker } from './StationAmenities'
import { useId, useState } from 'react'
import { NetworkProviderIcon } from './NetworkProviderIcon'
import { VehicleTypeSelector } from './VehicleTypeSelector'
import { HealthBadge } from './ChargeGuard'
import { CHARGING_NETWORKS, pointAvailable } from '../../../shared/chargingPoints'
import './ChargingPointEditor.css'

import { newChargingPoint } from '../data/chargingPointDefaults'
function Field({ label, value, onChange, type = 'text', required = true, min, step }) {
  const id = useId()
  return <label htmlFor={id}>{label}<input id={id} value={value ?? ''} type={type} min={min} step={step} required={required} onChange={(event) => onChange(event.target.value)} /></label>
}
export function ChargingPointEditor({ value, onChange }) {
  const group = useId()
  const points = value.chargingPoints || []
  const update = (index, patch) => onChange({ ...value, chargingPoints: points.map((p, i) => i === index ? { ...p, ...patch } : p) })
  return <div className="points-editor">
    <fieldset><legend>Charging Network</legend><div className="network-options">{['', ...CHARGING_NETWORKS].map((name) => <label key={name} className={value.chargingNetwork === name ? 'selected' : ''}><input type="radio" name={group} value={name} checked={(value.chargingNetwork || '') === name} onChange={() => onChange({ ...value, chargingNetwork: name })} /><NetworkProviderIcon name={name} />{name || 'Independent / unspecified'}</label>)}</div>
      {value.chargingNetwork === 'Other' && <Field label="Other network name" value={value.otherNetworkName} onChange={(otherNetworkName) => onChange({ ...value, otherNetworkName })} />}
    </fieldset>
    <h3>Charging Points</h3><p className="points-help">Each point accepts one reservation at a time. Add independently usable sockets as separate points. Connector counts describe alternative plugs on the same point.</p>
    {points.map((point, index) => {
      return <fieldset className="point-editor-card" key={point._id || index}><legend>{point.name || `Charging Point ${index + 1}`}</legend>
        <Field label="Charging point name" value={point.name} onChange={(name) => update(index, { name })} />
        <VehicleTypeSelector value={point.vehicleType || 'car'} onChange={(vehicleType) => { if (vehicleType !== point.vehicleType) update(index, { vehicleType, supportedVehicles: [], connectorTypes: [] }) }} />
        <div className="point-fields">
          <label>Charger mode<select value={point.chargingMode} onChange={(e) => update(index, { chargingMode: e.target.value })}><option>AC</option><option>DC</option></select></label>
          <Field label="Charging power (kW)" value={point.powerOutputKW} type="number" min="0.1" step="any" onChange={(powerOutputKW) => update(index, { powerOutputKW })} />
          <Field label="Price per kWh (INR)" value={point.pricePerKWh} type="number" min="0" step="0.01" onChange={(pricePerKWh) => update(index, { pricePerKWh })} />
          <Field label="Alternative connectors on this point" value={point.totalPorts} type="number" min="1" step="1" onChange={(totalPorts) => update(index, { totalPorts })} />
          <label>Availability<select value={point.availability || 'available'} onChange={(e) => update(index, { availability: e.target.value })}><option value="available">Available</option><option value="offline">Offline</option><option value="maintenance">Maintenance</option></select></label>
          <Field label="Exact connector names (comma separated)" value={point.connectorTypes.join(',')} onChange={(text) => update(index, { connectorTypes: text.split(',') })} />
        </div>
        <p className="points-help">Enter the actual compatible charging interface. “Other” does not establish compatibility. Bike batteries can require a specific manufacturer charger; verify its input rating and connector.</p>
        <button type="button" className="button button-secondary" disabled={points.length === 1} onClick={() => onChange({ ...value, chargingPoints: points.filter((_, i) => i !== index) })}>Remove charging point</button>
      </fieldset>
    })}
    <button type="button" className="button button-secondary" disabled={points.length >= 50} onClick={() => onChange({ ...value, chargingPoints: [...points, newChargingPoint(points.length + 1)] })}>+ Add Charging Point</button>
  </div>
}

export function StationPointManager({ station, onSaved }) {
  const [draft, setDraft] = useState(null)
  const [pointEdits, setPointEdits] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const points = station.chargers || []
  const blocked = ['PAUSED', 'SUSPENDED'].includes(station.chargeGuard?.state) || station.status !== 'available'
  return <section className="station-point-manager">
    <button type="button" className="button button-secondary" disabled={busy} onClick={() => onSaved(true)}>Refresh availability</button>
    <p><strong>Network:</strong> {station.chargingNetwork === 'Other' ? station.otherNetworkName : station.chargingNetwork || 'Independent / unspecified'}</p>
    <p>{points.length} charging points · {points.filter((p) => (p.vehicleType || 'car') === 'car').length} car · {points.filter((p) => p.vehicleType === 'bike').length} bike</p>
    <p>{station.pointBookingEnabled ? `${blocked ? 0 : points.filter((p) => pointAvailable(p) && !p.occupied).length} available now · ${points.filter((p) => p.occupied).length} occupied now` : 'Legacy station-level availability; configure points to enable independent bookings.'}</p>
    <details><summary>View charging points</summary>{points.map((p, i) => <p key={p._id}>{p.name || `Charging Point ${i + 1}`} · {p.vehicleType || 'car'} · {p.powerOutputKW} kW {p.chargingMode} · {p.connectorTypes.join(', ')} · ₹{p.pricePerKWh ?? station.pricing?.pricePerKWh}/kWh · {blocked || !pointAvailable(p) ? 'Unavailable for booking' : p.occupied ? 'Occupied' : 'Available'} · <HealthBadge state={p.chargeGuard?.state} /></p>)}</details>
    {!draft ? <button type="button" className="button button-secondary" onClick={() => { setMessage(''); setPointEdits(false); setDraft({ chargingNetwork: station.chargingNetwork || '', otherNetworkName: station.otherNetworkName || '', chargingPoints: points.map((p, i) => ({ ...p, name: p.name || `Charging Point ${i + 1}`, pricePerKWh: p.pricePerKWh ?? station.pricing?.pricePerKWh ?? 0 })) }) }}>Manage charging points</button> : <form onSubmit={async (e) => {
      e.preventDefault(); if (busy) return; setBusy(true); setMessage('')
      try {
        const response = await fetch(`/api/charging-stations/${station._id}/points`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(!pointEdits && draft.amenities !== undefined ? { amenities: draft.amenities } : draft) })
        const data = await response.json(); if (!response.ok) throw new Error(data.message)
        setDraft(null); setMessage(data.message); await onSaved(true)
      } catch (error) { setMessage(error.message || 'Unable to save charging points.') } finally { setBusy(false) }
    }}><fieldset disabled={busy}><ChargingPointEditor value={draft} onChange={value => { setPointEdits(true); setDraft(value) }} /><AmenitiesPicker value={draft.amenities ?? station.amenities} onChange={amenities => setDraft(value => ({ ...value, amenities }))} /><button className="button button-primary">{busy ? 'Saving…' : 'Save charging points'}</button><button type="button" className="button button-secondary" onClick={() => setDraft(null)}>Cancel</button></fieldset></form>}
    {message && <p role="status">{message}</p>}
  </section>
}
