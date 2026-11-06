import { useEffect, useId, useRef, useState } from 'react'
import './Wallet.css'
const inr = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format((amount || 0) / 100)
async function api(path, body) {
  const response = await fetch(`/api/wallet${path}`, { credentials: 'include', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Wallet unavailable.')
  return data
}
const changed = () => window.dispatchEvent(new Event('wallet-updated'))
export function WalletPanel({ role = 'consumer' }) {
  const id = useId(), busyRef = useRef(false)
  const [data, setData] = useState(null), [earnings, setEarnings] = useState(null)
  const [amount, setAmount] = useState('500'), [open, setOpen] = useState(false), [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const [version, setVersion] = useState(0), [page, setPage] = useState(1), [range, setRange] = useState('7')
  useEffect(() => {
    const refresh = () => setVersion(value => value + 1)
    window.addEventListener('wallet-updated', refresh)
    const timer = setInterval(refresh, 30000)
    return () => { window.removeEventListener('wallet-updated', refresh); clearInterval(timer) }
  }, [])
  useEffect(() => {
    let active = true
    Promise.all([api(`?role=${role}&page=${page}`), role === 'host' ? api(`/earnings?range=${range}`) : null]).then(([wallet, totals]) => {
      if (active) { setData(wallet); setEarnings(totals); setError('') }
    }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [role, page, range, version])
  const submit = async () => {
    if (busyRef.current || !data) return
    busyRef.current = true; setBusy(true); setError('')
    try {
      const storageKey = `bee-recharge:${data.wallet._id}`
      let pending
      try { pending = JSON.parse(localStorage.getItem(storageKey)) } catch { /* Replace invalid local draft. */ }
      if (!pending || pending.amount !== amount) pending = { amount, idempotencyKey: crypto.randomUUID() }
      localStorage.setItem(storageKey, JSON.stringify(pending))
      const result = await api('/recharge', pending)
      localStorage.removeItem(storageKey); setMessage(result.message); setConfirm(false); setOpen(false); setPage(1); changed()
    } catch (err) { setError(err.message) } finally { busyRef.current = false; setBusy(false) }
  }
  return <section className="bee-wallet" aria-label={`${role} BEE wallet`}>
    <div className="wallet-heading"><div><h3>{role === 'host' ? 'Host Wallet & Earnings' : 'BEE Wallet'}</h3><strong className="wallet-balance">{data ? inr(data.wallet.balanceInPaise - (data.wallet.reservedInPaise || 0)) : 'Loading…'}</strong><p>Available {role} balance · INR</p></div><button type="button" className="button button-secondary" onClick={() => setVersion(v => v + 1)}>Refresh wallet</button></div>
    {role === 'consumer' && <button type="button" className="button button-primary" onClick={() => { setOpen(!open); setConfirm(false); setError('') }}>Add Money</button>}
    {open && <form className="wallet-recharge" onSubmit={event => { event.preventDefault(); setConfirm(true) }}>
      <h4>Wallet recharge</h4><p>Recharge adds simulated funds to your wallet.</p>
      <fieldset disabled={busy || confirm}><div className="wallet-presets">{[100, 200, 500, 1000].map(value => <button className="button button-secondary" type="button" key={value} aria-pressed={amount === String(value)} onClick={() => setAmount(String(value))}>₹{value}</button>)}</div>
      <label htmlFor={`${id}-amount`}>Custom amount (₹)</label><input id={`${id}-amount`} type="number" min="1" max="10000" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} />
      {!confirm && <button className="button button-primary">Review recharge</button>}</fieldset>
      {confirm && <div><p>Add <strong>{inr(Math.round(Number(amount) * 100))}</strong> in simulated funds?</p><button type="button" className="button button-primary" disabled={busy} onClick={submit}>{busy ? 'Adding…' : 'Confirm recharge'}</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => setConfirm(false)}>Edit amount</button></div>}
    </form>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    {earnings && <div className="wallet-earnings"><div className="wallet-stats">{[['Total earnings', earnings.totalInPaise], ["Today's earnings", earnings.todayInPaise], ["This month's earnings", earnings.monthInPaise]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{inr(value)}</strong></div>)}<div><span>Completed paid sessions</span><strong>{earnings.completedSessions}</strong></div></div>
      <label htmlFor={`${id}-range`}>Earnings over time</label><select id={`${id}-range`} value={range} onChange={event => setRange(event.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="6m">Last 6 months</option></select>
      <div className="wallet-chart" role="img" aria-label={`Earnings chart. ${earnings.series.map(row => `${row.label}: ${inr(row.amountInPaise)}`).join('; ')}`}>
        {earnings.series.map(row => <div className="wallet-bar-column" key={row.label} title={`${row.label}: ${inr(row.amountInPaise)}`}><div className="wallet-bar-track"><div className="wallet-bar" style={{ height: `${Math.max(1, 70 * Math.abs(row.amountInPaise) / Math.max(1, ...earnings.series.map(item => Math.abs(item.amountInPaise))))}px`, ...(row.amountInPaise < 0 ? { top: '50%', background: 'var(--ev-ink)' } : { bottom: '50%' }) }} /></div><small>{row.label.slice(range === '6m' ? 2 : 5)}</small></div>)}
      </div><p>INR · Asia/Kolkata · No platform commission. Credits rise above the baseline; reversals extend below it.</p>
      <details><summary>View chart values</summary>{earnings.series.map(row => <p key={row.label}>{row.label}: {inr(row.amountInPaise)}</p>)}</details>
    </div>}
    <details className="wallet-history"><summary>Transaction history</summary>{data?.transactions.length === 0 && <p>No transactions yet.</p>}
      {data?.transactions.map(entry => <article key={entry._id}><div><strong>{entry.direction} · {inr(entry.amountInPaise)}</strong><span>{entry.status}</span></div><p>{entry.description}</p><small>{new Date(entry.createdAt).toLocaleString()}{entry.bookingId && ` · Booking ${entry.bookingId}`}</small></article>)}
      <div className="wallet-presets"><button type="button" className="button button-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page}</span><button type="button" className="button button-secondary" disabled={!data?.hasMore} onClick={() => setPage(p => p + 1)}>Next</button></div>
    </details>
  </section>
}
export function BookingWallet({ request, onQuote }) {
  const payload = JSON.stringify(request)
  const [quote, setQuote] = useState(null), [error, setError] = useState(''), [version, setVersion] = useState(0)
  useEffect(() => { const update = () => setVersion(v => v + 1); window.addEventListener('wallet-updated', update); return () => window.removeEventListener('wallet-updated', update) }, [])
  useEffect(() => {
    let active = true
    onQuote(null)
    api('/quote', JSON.parse(payload)).then(data => {
      if (!active) return
      const storage = 'bee-booking-payment'
      let pending
      try { pending = JSON.parse(sessionStorage.getItem(storage)) } catch { /* Start a new intent. */ }
      if (!pending || pending.payload !== payload) pending = { payload, key: crypto.randomUUID() }
      sessionStorage.setItem(storage, JSON.stringify(pending))
      setQuote(data); setError(''); onQuote({ ...data, key: pending.key })
    }).catch(err => { if (active) { setError(err.message); setQuote(null) } })
    return () => { active = false }
  }, [payload, onQuote, version])
  return <div className="bee-wallet wallet-checkout"><strong>Wallet payment</strong>{error ? <p role="alert">{error}</p> : quote ? <p>Booking amount: <strong>{inr(quote.amountInPaise)}</strong> · Balance: {inr(quote.balanceInPaise)}{!quote.sufficient && ' · Insufficient balance. Add money below.'}</p> : <p>Calculating payment…</p>}<details><summary>Add Money / Wallet</summary><WalletPanel /></details></div>
}
export function BookingPayment({ booking }) {
  if (!booking.payment?.status) return null
  const label = { RESERVED: 'Reserved until charging completes', PAID: 'Paid', REFUNDED: 'Refunded', RELEASED: 'Funds released' }[booking.payment.status]
  return <div className="bee-wallet wallet-booking"><p>Wallet payment · {inr(booking.payment.amountInPaise)} · {label}</p></div>
}
