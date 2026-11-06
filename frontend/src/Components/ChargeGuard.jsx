import { useEffect, useId, useRef, useState } from 'react'
import { chargeGuardRequest } from '../services/chargeGuardApi'
import './ChargeGuard.css'

const categories = {
  charging_did_not_start: 'Charging did not start',
  charger_malfunction: 'Charger malfunction',
  power_unavailable: 'Power unavailable',
  host_unavailable: 'Host unavailable',
  other: 'Other charging issue',
}
const date = (value) => value ? new Date(value).toLocaleString() : '—'
export function HealthBadge({ state = 'ACTIVE' }) {
  return <span className={`cg-badge cg-${state.toLowerCase()}`}>{state}</span>
}

export function BookingChargeGuard({ booking, onReported }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [reported, setReported] = useState([])
  const submitting = useRef(false)
  const trigger = useRef(null)
  const select = useRef(null)
  const stationState = booking.stationHealth || booking.station?.chargeGuard?.state || 'ACTIVE'
  const state = ['PAUSED', 'SUSPENDED'].includes(stationState) ? stationState : booking.dockHealth || stationState
  useEffect(() => { if (open) select.current?.focus() }, [open])
  const close = () => { setOpen(false); trigger.current?.focus() }
  const atRisk = booking.status === 'confirmed' && ['PAUSED', 'SUSPENDED'].includes(state)
  if (!atRisk && state !== 'PROBATION' && !booking.chargeGuardReportEligible && !message) return null
  return <div className="cg-booking">
    {atRisk && <div className="cg-notice" role="status"><HealthBadge state={state} /><p><strong>Your reservation may be at risk.</strong> A charging issue was reported. Your booking remains in place, but charging may be unavailable.</p></div>}
    {state === 'PROBATION' && <p className="cg-muted">Host repair declared; dock or legacy station is in probation. Hardware has not been independently verified.</p>}
    {booking.chargeGuardReportEligible && !open && <button ref={trigger} type="button" className="button button-secondary cg-trigger" onClick={() => { setError(''); setOpen(true) }}>Report Charging Issue</button>}
    {open && <form className="cg-form" onSubmit={async (event) => {
      event.preventDefault()
      if (submitting.current) return
      const values = new FormData(event.currentTarget)
      const category = values.get('category')
      submitting.current = true; setBusy(true); setError('')
      try {
        const result = await chargeGuardRequest('/reports', { bookingId: booking._id, ...(booking.chargingPointId ? { chargingPointId: booking.chargingPointId } : {}), category, description: values.get('description') })
        setMessage(result.message); setReported((items) => [...items, category]); close(); onReported?.()
      } catch (err) { setError(err.message) } finally { submitting.current = false; setBusy(false) }
    }}>
      <h4>Report a charging issue</h4>
      <p><strong>{booking.station?.name || 'Station'}</strong> · {booking.chargingPointId ? booking.chargingPointName || 'Assigned dock' : 'Legacy booking — no verified dock assignment'}</p>
      {booking.dockConnectorTypes?.length > 0 && <p className="cg-muted">{booking.dockConnectorTypes.join(', ')}</p>}
      <p className="cg-muted">Report what happened during this booking. {booking.chargingPointId ? 'Only the assigned dock will be paused' : 'Eligible legacy station reports pause station reservations; bookings without a verified dock at a multi-dock station require host assistance'} while the host investigates; reports do not establish fault.</p>
      <label htmlFor={`${id}-category`}>Issue type</label>
      <select ref={select} id={`${id}-category`} name="category" required disabled={busy} defaultValue="">
        <option value="" disabled>Select an issue</option>
        {Object.entries(categories).map(([value, label]) => <option key={value} value={value} disabled={reported.includes(value)}>{label}{reported.includes(value) ? ' (reported)' : ''}</option>)}
      </select>
      <label htmlFor={`${id}-description`}>Explanation <span className="cg-muted">(optional)</span></label>
      <textarea id={`${id}-description`} name="description" maxLength={2000} rows={3} disabled={busy} />
      {error && <p role="alert">{error}</p>}
      <div className="cg-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</button><button type="button" className="button button-secondary" disabled={busy} onClick={close}>Cancel</button></div>
    </form>}
    {message && <p className="cg-notice" role="status">{message}</p>}
  </div>
}

function RepairForm({ incident, onSaved }) {
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  return <form className="cg-form" onSubmit={async (event) => {
    event.preventDefault()
    if (submitting.current) return
    const data = new FormData(event.currentTarget)
    submitting.current = true; setBusy(true); setError('')
    try {
      await chargeGuardRequest(`/incidents/${incident._id}/repair`, { problem: data.get('problem'), fix: data.get('fix'), tested: data.get('tested') === 'on' })
      onSaved()
    } catch (err) { setError(err.message) } finally { submitting.current = false; setBusy(false) }
  }}>
    <label htmlFor={`${id}-problem`}>What was the problem?</label>
    <textarea id={`${id}-problem`} name="problem" required maxLength={2000} rows={3} disabled={busy} />
    <label htmlFor={`${id}-fix`}>What did you fix?</label>
    <textarea id={`${id}-fix`} name="fix" required maxLength={2000} rows={3} disabled={busy} />
    <label className="cg-check"><input type="checkbox" name="tested" required disabled={busy} /> I performed a post-repair charging test.</label>
    <p className="cg-muted">This records your declaration, not independent hardware verification. Once all open issues are resolved, reservations reopen provisionally. A repeat issue from a separate post-repair booking during probation requires administrator review.</p>
    {error && <p role="alert">{error}</p>}
    <button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Submit repair declaration'}</button>
  </form>
}

export function HostChargeGuard() {
  const [incidents, setIncidents] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let timer
    async function refresh() {
      try {
        const data = await chargeGuardRequest('/host/incidents', undefined, controller.signal)
        setIncidents(data.incidents); setError('')
      } catch (err) { if (err.name !== 'AbortError') setError(err.message) }
      finally { if (!controller.signal.aborted) timer = setTimeout(refresh, 30000) }
    }
    refresh()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [version])
  return <section className="cg-panel" aria-labelledby="cg-host-title">
    <div className="cg-heading"><div><h3 id="cg-host-title">Charger Health</h3><p className="cg-muted">Reported issues and repair declarations · Updates every 30 seconds</p></div><button type="button" className="button button-secondary" onClick={() => setVersion((value) => value + 1)}>Refresh</button></div>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status" className="cg-notice">{message}</p>}
    {!incidents && !error && <p className="cg-loading" role="status">Loading reported issues…</p>}
    {incidents?.length === 0 && <p className="cg-empty">No charging issues reported. New reports will appear here.</p>}
    {incidents?.map((incident) => {
      const dock = incident.chargingPointId ? incident.station?.chargers?.find((point) => String(point._id) === String(incident.chargingPointId)) : null
      const health = incident.chargingPointId ? dock?.chargeGuard : incident.station?.chargeGuard
      const state = health?.state || 'ACTIVE'
      return <article className="cg-incident" key={incident._id}>
        <div className="cg-heading"><h4>{incident.station?.name || 'Station unavailable'}</h4><HealthBadge state={state} /></div>
        <p>{incident.chargingPointId ? incident.chargingPointName || dock?.name || 'Assigned dock' : 'Legacy station-wide report'}{incident.connectorTypes?.length > 0 ? ` · ${incident.connectorTypes.join(', ')}` : ''}</p>
        <strong>{categories[incident.category]}</strong>
        <dl className="cg-facts"><div><dt>Booking reference</dt><dd>{incident.booking}</dd></div><div><dt>Reported</dt><dd>{date(incident.reportedAt)}</dd></div></dl>
        {incident.description && <p className="cg-description">{incident.description}</p>}
        {state === 'SUSPENDED' ? <p className="cg-notice">Administrator review required. You cannot reactivate this dock or legacy station. A repeat report is not proof of dishonesty.</p> : !incident.resolvedAt ? <p className="cg-muted">Action required: investigate, repair, and test before declaring this issue resolved.</p> : <p className="cg-muted">Resolved {date(incident.resolvedAt)}{state === 'PROBATION' ? ` · Probation ends ${date(health?.probationUntil)}` : ''}</p>}
        <details><summary>{incident.repair?.at ? 'View repair declaration' : incident.resolvedAt ? 'View resolution' : 'Open incident'}</summary>
          {incident.repair?.at ? <div className="cg-description"><p><strong>Problem:</strong> {incident.repair.problem}</p><p><strong>Fix:</strong> {incident.repair.fix}</p><p>Test declared by host · {date(incident.repair.at)}</p><p className="cg-muted">This is a host claim, not independent verification.</p></div> : incident.resolvedAt ? <p>Resolved through administrator review.</p> : state !== 'SUSPENDED' ? <RepairForm incident={incident} onSaved={() => { setMessage('Repair declaration saved. Affected dock or legacy station status is shown below.'); setVersion((value) => value + 1) }} /> : <p>Contact your administrator for review.</p>}
        </details>
      </article>
    })}
  </section>
}
