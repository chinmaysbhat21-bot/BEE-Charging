import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './ChargerMap.css'

export default function ChargerMap({ rows, center, renderCard, empty, preferences, refreshControl }) {
  const container = useRef(null)
  const cards = useRef(null)
  const markers = useRef(new Map())
  const drag = useRef(null)
  const dragged = useRef(false)
  const sheet = useRef(null)
  const [engine, setEngine] = useState(null)
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [sheetPosition, setSheetPosition] = useState('half')
  const [message, setMessage] = useState('')
  const [locating, setLocating] = useState(false)
  const [denied, setDenied] = useState(false)
  const [position, setPosition] = useState(null)
  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: false })
    map.setView(center || { lat: 22, lng: 79 }, center ? 12 : 5)
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    })
    tiles.on('tileerror', () => setMessage('Some map tiles could not load. You can still browse chargers.'))
    tiles.on('tileload', () => setMessage(current => current.startsWith('Some map tiles') ? '' : current))
    tiles.addTo(map)
    setEngine({ map })
    return () => {
      tiles.off()
      markers.current.clear()
      map.remove()
    }
  }, [center?.lat, center?.lng])

  const needle = query.trim().toLowerCase()
  const matches = rows.filter(({ station, available }) =>
    (!availableOnly || available > 0) &&
    (!needle || [station.name, station.address, station.area, station.city, station.chargingNetwork, station.otherNetworkName,
      ...station.chargers.flatMap(dock => dock.connectorTypes || [])].some(value => String(value || '').toLowerCase().includes(needle))))
  const origin = position || center
  const visible = origin ? matches.map(row => {
    if (!row.position) return row
    const distanceMeters = L.latLng(origin).distanceTo(row.position)
    return { ...row, distanceMeters }
  }) : matches

  useEffect(() => {
    if (!engine) return
    const active = new Set()
    for (const row of visible) {
      if (!row.position) continue
      active.add(row.id)
      let entry = markers.current.get(row.id)
      if (!entry) {
        const icon = document.createElement('span')
        icon.className = 'bee-map-marker'
        icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 2 4 14h7l-1 8 10-12h-7z"/></svg>'
        const marker = L.marker(row.position, { icon: L.divIcon({ className: 'bee-leaflet-icon', html: icon, iconSize: [34, 34], iconAnchor: [17, 30] }) }).addTo(engine.map)

        marker.on('click', () => {
          setSelected(row.id)
          setSheetPosition('half')
          requestAnimationFrame(() => cards.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
        })
        entry = { marker, icon }
        markers.current.set(row.id, entry)
      }

      entry.marker.setLatLng(row.position)
      entry.marker.getElement()?.setAttribute('aria-label', row.station.name + (row.available ? ' · ' + row.available + ' bookable' : ' · No matching slots'))
      entry.marker.setZIndexOffset(selected === row.id ? 1000 : 0)
      entry.icon.dataset.selected = String(selected === row.id)
      entry.icon.dataset.available = String(row.available > 0)
    }
    for (const [id, entry] of markers.current) {
      if (!active.has(id)) { entry.marker.remove(); markers.current.delete(id) }
    }
  }, [engine, visible, selected])

  useEffect(() => {
    if (!engine || !position) return
    engine.map.panTo(position)
    const dot = L.marker(position, {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: 'bee-map-user-dot', iconSize: [14, 14], iconAnchor: [7, 7] }),
    }).addTo(engine.map)
    return () => { dot.remove() }
  }, [engine, position])

  function locate() {
    if (!navigator.geolocation) { setMessage('Device location is unavailable. You can still search and pan the map.'); return }
    setLocating(true)
    setMessage('')
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const point = { lat: coords.latitude, lng: coords.longitude }
      setPosition(point)
      setLocating(false)
    }, error => {
      setDenied(error.code === 1)
      setMessage(error.code === 1 ? 'Location permission denied. Search or move the map to find chargers.' : 'Location could not be found. Try again or search by area.')
      setLocating(false)
    }, { timeout: 12000, maximumAge: 0 })
  }

  return <section className="bee-discovery" data-sheet={sheetPosition} aria-label="Charger discovery">
    <button type="button" className="bee-map-locate" aria-label="Use my location" title="Use my location"
      aria-busy={locating} disabled={!engine || locating || denied} onClick={locate}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
      </svg>
    </button>
    <div className="bee-discovery-tools">
      <label>Search chargers<input type="search" placeholder="Station, area, network or connector" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="bee-map-chips">
        {refreshControl}
        <label className="bee-discovery-filter"><input type="checkbox" checked={availableOnly} onChange={event => setAvailableOnly(event.target.checked)} /> Bookable only</label>
      </div>
    </div>
    <div className="bee-map-stage">
      <div ref={container} className="bee-map-canvas" aria-label="Interactive charger map" />
      {!engine && !message && <p role="status" className="bee-map-loading">Loading map…</p>}
    </div>
    {message && <p className="bee-map-note" role="status">{message}</p>}
    <div ref={sheet} className="bee-map-sheet" data-position={sheetPosition} data-map={Boolean(engine)}>
      <button type="button" className="bee-sheet-handle" aria-expanded={sheetPosition !== 'collapsed'}
        onPointerDown={event => {
          dragged.current = false
          drag.current = { y: event.clientY, height: sheet.current.offsetHeight }
          sheet.current.style.transition = 'none'
          sheet.current.parentElement.dataset.dragging = 'true'
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          if (!drag.current) return
          const delta = drag.current.y - event.clientY
          dragged.current ||= Math.abs(delta) > 8
          const total = sheet.current.parentElement.clientHeight
          sheet.current.style.height = Math.min(total * .85, Math.max(total * .27, drag.current.height + delta)) + 'px'
        }}
        onPointerUp={event => {
          if (dragged.current) {
            const ratio = sheet.current.offsetHeight / sheet.current.parentElement.clientHeight
            setSheetPosition(ratio < .425 ? 'collapsed' : ratio < .685 ? 'half' : 'expanded')
          }
          sheet.current.style.height = ''
          sheet.current.style.transition = ''
          delete sheet.current.parentElement.dataset.dragging
          drag.current = null
        }}
        onPointerCancel={() => { drag.current = null; sheet.current.style.height = ''; sheet.current.style.transition = ''; delete sheet.current.parentElement.dataset.dragging }}
        onClick={event => { if (!dragged.current || event.detail === 0) setSheetPosition(current => current === 'collapsed' ? 'half' : current === 'half' ? 'expanded' : 'collapsed') }}>
        <span className="bee-sr-only">Resize charger results</span>
      </button>
      <div className="bee-sheet-heading">
        <div><strong>Nearby chargers</strong><small>{visible.length} {visible.length === 1 ? 'charger' : 'chargers'} found</small></div>
        {engine && visible.some(row => row.position) && <button type="button" className="bee-map-view-all" onClick={() => {
          engine.map.fitBounds(L.latLngBounds(visible.filter(row => row.position).map(row => row.position)), { padding: [30, 30], maxZoom: 13 })
        }}>Show all</button>}
      </div>
      <div className="bee-map-cards" ref={cards}>
        <div className="bee-sheet-preferences" onToggle={event => {
          if (event.target.open) setSheetPosition(current => current === 'collapsed' ? 'half' : current)
        }}>{preferences}</div>
        {visible.length ? visible.map(row => <div key={row.id} data-selected={selected === row.id} className="bee-map-result">
          <button type="button" className="bee-map-select" disabled={!row.position} aria-label={row.position ? 'Show ' + row.station.name + ' on map' : row.station.name + ' · map location unavailable'} aria-pressed={selected === row.id} onClick={() => {
            setSelected(row.id)
            if (row.position) engine?.map.panTo(row.position)
          }}>{row.distanceMeters != null ? (row.distanceMeters / 1000).toFixed(1) + ' km · ' : ''}{row.available ? row.available + (row.available === 1 ? ' bookable dock' : ' bookable docks') : 'No matching slots'}</button>
          {renderCard(row)}
        </div>) : empty}
      </div>
    </div>
  </section>
}
