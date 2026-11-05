/* Static regression checks for the presentation/API wiring changes.
 * Run with `npm run test:ui-contracts`; requires only Node.js. These are NOT
 * replacements for browser flows, backend integration tests, or a Vite build.
 */
import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const theme = readFileSync(new URL('../src/reference-theme.css', import.meta.url), 'utf8')
const tokens = readFileSync(new URL('../src/reference-tokens.css', import.meta.url), 'utf8')
const backend = readFileSync(new URL('../../backend/routes/chargingStations.js', import.meta.url), 'utf8')
const batteryProfiles = readFileSync(new URL('../src/data/evBatteryProfiles.js', import.meta.url), 'utf8')
const profileStyles = readFileSync(new URL('../src/ev-profile-picker.css', import.meta.url), 'utf8')
const navigationStyles = readFileSync(new URL('../src/redesign-navigation.css', import.meta.url), 'utf8')
const bookings = readFileSync(new URL('../../backend/routes/bookings.js', import.meta.url), 'utf8')
const contract = [
  ['reference lime', () => assert.match(tokens, /--ev-lime:\s*#C7FE2F/)],
  ['reference ink', () => assert.match(tokens, /--ev-ink:\s*#090708/)],
  ['single active consumer stations GET uses public API', () => assert.match(app, /const loadChargingStations = async[\s\S]*?fetch\('\/api\/charging-stations'\s*,/)],
  ['host stations GET remains private', () => assert.match(app, /const fetchHostedStations = async[\s\S]*?fetch\('\/api\/charging-stations\/my'/)],
  ['host listing renders private records', () => assert.match(app, /hostedStations\.map\(\(station\)/)],
  ['host save refreshes after POST', () => assert.match(app, /Charging station saved successfully\.[\s\S]*?await fetchHostedStations\(\)/)],
  ['host price submission matches backend spelling', () => { assert.match(app, /pricePerKwh: '0'/);assert.match(backend, /pricePerKwh,/)}],
  ['booking still POSTs to existing API', () => assert.match(app, /fetch\('\/api\/bookings'/)],
  ['booking station details are still present', () => assert.match(app, /className="station-details-page"/)],
  ['EV profiles are integrated into the existing battery form', () => { assert.match(app, /<section className="ev-profile-picker"/);assert.match(app, /onSubmit=\{handleSaveBattery\}/)}],
  ['vehicle profile search, variant selection and custom entry are available', () => {assert.match(app, /type="search"/);assert.match(app, /battery-profile-variant/);assert.match(app, /Other \/ Add Custom EV/)}],
  ['profile selection requires review and supports clearing', () => {assert.match(app, /evProfileReviewed/);assert.match(app, /Clear selection/)}],
  ['profile data preserves uncertain ranges without assigning a made-up DC value', () => {assert.match(batteryProfiles, /min: 50, max: 65, verificationStatus: 'unverified'/);assert.match(batteryProfiles, /maxDcChargingPowerKw: null/)}],
  ['profile picker has responsive mobile layouts', () => {assert.match(profileStyles, /@media \(max-width: 600px\)/);assert.match(profileStyles, /\.ev-profile-options \{ grid-template-columns: 1fr;/)}],
  ['unknown mode-specific limits are not replaced by the opposite charging mode', () => {assert.match(app, /hasModeSpecificPower/);assert.match(bookings, /&& !hasModeSpecificPower/)}],
  ['authentication still includes login and OTP', () => {assert.match(app, /verifyLoginOtp/);assert.match(app, /<Signup/)}],
  ['host and consumer theme sections remain', () => { assert.match(theme, /\.host-dashboard/);assert.match(theme, /\.consumer-bottom-nav/)}],
  ['disabled buttons and keyboard focus styled', () => {assert.match(theme, /button:disabled/);assert.match(tokens, /:focus-visible/)}],
  ['My Orders is available in persistent desktop and mobile navigation', () => {assert.match(app, /<span>My Orders<\/span>/);assert.match(app, /className="primary-navigation"/);assert.match(navigationStyles, /\.consumer-bottom-nav\s*\{\s*display:\s*none/);assert.match(navigationStyles, /@media \(max-width: 800px\)[\s\S]*?\.consumer-bottom-nav\s*\{[\s\S]*?display:\s*grid/)}],
  ['first-time guidance links to existing station, orders, EV registration and host views', () => {assert.match(app, /className="first-visit-guide"/);assert.match(app, /Find a Charging Station/);assert.match(app, /View My Orders/);assert.match(app, /Register Your EV/);assert.match(app, /Share your charger/)}],
  ['empty orders state can continue into station discovery', () => {assert.match(app, /className="orders-empty-state"/);assert.match(app, /setActiveSection\('main'\); setActiveTab\('book'\)/)}],
  ['mobile navigation includes visible focus and reduced-motion support', () => {assert.match(navigationStyles, /button:focus-visible/);assert.match(navigationStyles, /prefers-reduced-motion: reduce/)}],
  ['header separates brand, navigation and menu with responsive sizing', () => {assert.match(navigationStyles, /grid-template-columns:\s*minmax\(0,\s*clamp\(285px,\s*25vw,\s*325px\)\) minmax\(0,\s*1fr\) 42px/);assert.match(navigationStyles, /position:\s*static/);assert.match(navigationStyles, /max-width:\s*clamp\(285px,\s*25vw,\s*325px\)/);assert.match(navigationStyles, /@media \(max-width: 800px\)[\s\S]*?\.primary-navigation \{ display: none; \}/)}],
  ['station cards and booking controls stay within tablet widths', () => {assert.match(navigationStyles, /\.booking-controls,\s*\.booking-results-scroll \{ min-width: 0; \}/);assert.match(navigationStyles, /@media \(min-width: 701px\) and \(max-width: 800px\)[\s\S]*?grid-template-columns: 78px minmax\(0, 1fr\) 104px/)}],
]
for (const [label, run] of contract) { run();console.log(`PASS ${label}`) }
console.log(`${contract.length} UI contract checks passed.`)
