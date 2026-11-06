// Row positions in the original, user-supplied 1080 × 1136 reference.
// Display a small viewport of the original image so the supplied logos stay intact.
const rows = ['Sunfuel', 'REIL', 'Torrent', 'eFill', 'Statiq', 'Powerbank', 'Vaari Energy', 'KIA', 'Other', 'HPCL']

export function NetworkProviderIcon({ name }) {
  const row = rows.indexOf(name)
  return <span
    className={`network-provider-icon${row < 0 ? ' network-provider-icon-independent' : ''}`}
    style={row < 0 ? undefined : {
      backgroundImage: `url("${import.meta.env.BASE_URL}network-provider-icons.jpeg")`,
      backgroundPosition: `-29.4px -${(192 + row * 96) * 0.6}px`,
    }}
    aria-hidden="true"
  >{row < 0 ? '—' : null}</span>
}
