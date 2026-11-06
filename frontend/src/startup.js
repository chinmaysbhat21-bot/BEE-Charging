import { Capacitor } from '@capacitor/core'
import './startup.css'

// Module scope intentionally keeps this independent of React renders and navigation.
if (Capacitor.isNativePlatform()) {
  const splash = document.createElement('div')
  splash.className = 'bee-opening'
  splash.setAttribute('aria-hidden', 'true')
  splash.innerHTML = `<div class="bee-opening-lockup"><div class="bee-opening-mark"><span class="bee-opening-spark"></span><span class="bee-opening-container"></span><span class="bee-opening-bolt"></span></div><span class="bee-opening-name">BEE Charging</span></div>`
  document.body.appendChild(splash)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const remove = () => splash.remove()
  splash.addEventListener('animationend', event => {
    if (event.target === splash) remove()
  })
  // A bounded fallback also removes the overlay if animations are disabled.
  setTimeout(remove, reduced ? 350 : 1900)
}
