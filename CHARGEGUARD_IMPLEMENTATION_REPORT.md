# BEE ChargeGuard implementation

Implemented and verified on 5 November 2026. Recoverable baseline commit: `36eeae5` (`Baseline existing BEE application before ChargeGuard`). The supplied folder had no Git repository; the baseline contains the original application. No existing user files were discarded. Changes are left in the working tree for review.

## Behavior and policy

- Existing React/Express/Mongoose architecture, operational station `status`, booking/cancellation rules, palette, fonts and design tokens are preserved.
- Authenticated consumers can report their own **confirmed** booking from its exact `startAt` through 24 hours after `endAt`. Future, cancelled, unrelated, malformed and nonexistent bookings are rejected. This is booking-based eligibility, not proof of a physical charging attempt.
- Categories: charging did not start, charger malfunction, power unavailable, host unavailable, other. All five conservatively pause station-level reservations pending investigation. Explanation is optional, limited to 2,000 characters. Client station IDs, timestamps and roles are not trusted.
- A unique `(booking, category)` index and transactional checks prevent duplicate reports. Accepted incidents are retained permanently by the application; there are no incident/event deletion endpoints.
- A report pauses new reservations. Existing bookings and slot history remain intact; My Orders polls every 30 seconds and displays risk warnings. Eligible recent bookings can also be reported from History.
- Charger Health in the host dashboard is the database-backed notification inbox; it polls every 30 seconds. Only the current station owner sees and acts on that station's incidents. Open issues are listed first, up to 200 records. There are no SMS/email/push notifications.
- Each unresolved incident requires a problem description, fix description, and explicit test confirmation. Resolving all open incidents permits provisional reactivation. Each declaration retains its timestamp and probation expiry; the station retains the latest repair timestamp and expiry. Default probation is 24 hours, configurable through `CHARGEGUARD_PROBATION_HOURS` (positive number, maximum 720 hours). A declaration is explicitly identified as a host claim.
- A different eligible booking, with an attempt starting at or after a repair declaration, reporting the same category before that declaration's probation expires suspends the station. Late reports for pre-repair attempts do not count as failed repairs. Different categories pause for investigation. The same booking cannot count as an independent failure.
- Suspensions increment a retained counter, store a reason, mark the new incident for review, and cannot be bypassed through host repair. No host account ban is implemented.
- Authorized administrative reactivation records the reviewer label and decision, resolves outstanding incidents, and preserves prior reports, repair declarations, review flags, suspension count, and suspension reason. `reviewedAt` prevents pre-review repair declarations from automatically re-suspending the station after an administrator decision; subsequent reports still pause it normally.
- Probation is evaluated against persisted timestamps and server time. Effective state becomes ACTIVE after expiry even across restarts. A host read, report, or successful booking transaction lazily persists the expiry event; no running timer is required. Raw station listings can retain the stored PROBATION label until such a read/write, while booking eligibility and consumer booking health use effective state.

## Files

| File | Change |
| --- | --- |
| `backend/models/ChargingStation.js` | Separate defaulted `chargeGuard` subdocument with state, repair/probation/review timestamps, suspension count/reason. |
| `backend/models/ChargingIncident.js` | Report ownership, category, immutable report fields, resolution/repair declaration and unique booking/category index. |
| `backend/models/IncidentEvent.js` | Append-only application event history with actor, server timestamp, before/after states and details. |
| `backend/services/chargeGuard.js` | Eligibility, validation, transactional reporting/repair/review, probation and booking enforcement. |
| `backend/routes/chargeGuard.js` | Consumer, host and protected admin APIs. |
| `backend/routes/bookings.js` | Backend reservation restriction inside existing transaction; booking health and report eligibility in `/my`. |
| `backend/routes/chargingStations.js` | Corrected deletion reference from nonexistent `stationId` to `station`, preserving station/booking history. |
| `backend/server.js` | Registers ChargeGuard router. |
| `backend/.env.example` | Probation/admin configuration and replica-set requirement. |
| `backend/package.json`, lockfile | Node test runner, isolated MongoDB and HTTP test dependencies. |
| `backend/tests/chargeGuard.test.js` | 19 real MongoDB/HTTP integration tests. |
| `backend/tests/uiFixture.js` | Isolated database/server for browser tests, using real authentication routes and sessions. Never loaded by production. |
| `frontend/src/Components/ChargeGuard.jsx` | Modular report form, booking warning, health badge, host inbox and repair form. |
| `frontend/src/Components/ChargeGuard.css` | Isolated token-based styles and scoped responsive fixes for cards containing ChargeGuard. |
| `frontend/src/services/chargeGuardApi.js` | Credentialed API helper. |
| `frontend/src/App.jsx` | Small integration points in orders/history/host, booking polling, station filtering. |
| `frontend/tests/chargeguard-ui.mjs` | Real browser workflow with screenshots, focus and overflow checks. |
| `frontend/package.json`, lockfile | Browser test command and Playwright development dependency. |
| `.gitignore` | Excludes dependencies, environment secrets, builds, logs and generated browser results. |

`Booking.js` requires no schema change. Legacy stations without ChargeGuard fields hydrate with ACTIVE defaults. Tests also exercise a real reservation and cancellation on a station whose stored ChargeGuard field was removed.

## API

All paths below are prefixed `/api/chargeguard`. JSON responses use standard 400 validation, 401 unauthenticated, 403 unauthorized, 404 missing/unowned, and 409 conflicting-state statuses. Unexpected database failures return 500 without leaking internals.

| Method/path | Authorization | Body/result |
| --- | --- | --- |
| POST `/reports` | Consumer session; owns eligible booking | `{ bookingId, category, description? }`; created incident. |
| GET `/host/incidents` | Consumer session; station ownership filter | Up to 200 incidents, current station health and repair data. |
| POST `/incidents/:id/repair` | Consumer session; current station owner | `{ problem, fix, tested: true }`; saved declaration. |
| GET `/admin/review` | Server-controlled Bearer credential | Up to 200 currently suspended stations. |
| GET `/admin/stations/:id` | Same admin credential | Full station report/event history for review. |
| POST `/admin/stations/:id/reactivate` | Same admin credential | `{ reviewer, decision }`; reactivated station and appended decision event. |

Existing `GET /api/bookings/my` additionally returns `stationHealth`, `chargeGuardReportEligible`, and populated station health. Existing `POST /api/bookings` rejects PAUSED/SUSPENDED stations with 409. React filtering is supplementary.

## Database and concurrency

New collections: `chargingincidents`, `incidentevents`. No destructive migration. Deploy the unique report index before accepting traffic (Mongoose auto-indexing handles development; explicitly create indexes when production auto-indexing is disabled).

Reports, station state, repairs and events commit together in MongoDB transactions. Station writes conflict with the existing booking transaction's station lock/write, causing MongoDB to retry with fresh state. Thus a reservation serialized before a report can remain, but subsequent reservations are blocked. No fallback writes partial state when transactions are unavailable. Use a MongoDB replica set or sharded deployment, as already required by the existing booking flow.

Event changes/deletions are rejected through normal application model operations and are not exposed through routes. This is not cryptographic tamper-proof storage: database administrators/raw driver access can modify data. A production database role should deny event updates/deletes and incident deletes. No automatic backup or full dispute-evidence system was added.

## Administrator operation

Set `CHARGEGUARD_ADMIN_TOKEN` on the backend to a randomly generated secret of at least 32 characters. Leave it empty to disable administration. Never place it in a `VITE_` variable, browser local storage, or frontend bundle. Consumer profile roles are ignored for administration because the existing app has no secure admin role system.

Use an authorized operations terminal over HTTPS (HTTP loopback only for development). Example PowerShell, with the secret already supplied securely in the terminal environment:

```powershell
$beeBase = 'https://your-backend.example/api/chargeguard'
$beeHeaders = @{ Authorization = "Bearer $env:CHARGEGUARD_ADMIN_TOKEN" }
Invoke-RestMethod -Uri "$beeBase/admin/review" -Headers $beeHeaders
$beeStationId = 'station-id-from-review'
Invoke-RestMethod -Uri "$beeBase/admin/stations/$beeStationId" -Headers $beeHeaders
# After an authorized reviewer has inspected the reports and repair evidence:
$beeDecision = @{ reviewer = 'operations-reviewer-id'; decision = 'Describe findings and reason for reactivation' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$beeBase/admin/stations/$beeStationId/reactivate" -Headers $beeHeaders -ContentType 'application/json' -Body $beeDecision
```

The shared credential establishes authorization; the reviewer label is an audit annotation, not independently authenticated individual identity. Use a managed admin identity provider if individual administrator attribution is required later. No ordinary consumer can grant this credential through an API.

## Actual verification

Baseline, before editing:

- Frontend build: passed.
- Frontend lint: exit 0 with 18 existing warnings (unused state, render-time Date usage, effects in existing files).
- Existing UI contracts: all 24 passed.
- Existing EV profiles: all 6 profiles and variant mappings passed.
- Backend `npm test`: failed because it was a placeholder (`Error: no test specified`), not because of application tests.
- Dependency installation reported existing vulnerabilities: frontend one high; backend one moderate and one high. No unrelated package upgrades were applied.

After implementation:

- **Backend: 19/19 integration tests passed** on a real isolated MongoDB 8.2.6 replica set. Coverage includes every requested case: valid/invalid/unauthorized/duplicate reports, pause, reservation rejection, owner-only host inbox, owner-only validated repair, probation and expiry, independent repeat failure, suspension, host bypass rejection, authorized review, and legacy compatibility. Additional checks cover cross-site writes, server timestamps, multi-incident resolution, admin configuration, real cancellation and report/reservation concurrency.
- The first isolated MongoDB startup timed out at its 10-second default. Retry passed; test fixtures now allow 60 seconds. No MongoDB integration test remains skipped.
- **Browser workflow passed** in Chromium using the real Express auth/session and ChargeGuard routes with an isolated replica set. Verified consumer report submission, reservation risk notice, recent-history form, host repair submission and PROBATION result. No browser page errors. Automatic focus on opening the report form and no horizontal overflow at 390×844 and 1440×1000 were checked. Desktop/mobile screenshots were rendered and inspected.
- A mobile map-button overflow encountered during browser verification was fixed with styles scoped to order cards containing ChargeGuard; global design tokens were not changed.
- Frontend production build: passed. Lint: passed with the same 18 baseline warnings and no new warnings. Both existing test scripts passed unchanged.
- `git diff --check`: passed (Git emitted only Windows line-ending notices).

Reproduce from repository root:

```powershell
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix backend test
npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend run test:ui-contracts
npm --prefix frontend run test:ev-profiles
Push-Location frontend
npx playwright install chromium
npm run test:chargeguard-ui
Pop-Location
```

Browser screenshots are generated in `frontend/test-results/chargeguard/` and ignored by Git. Browser fixtures bind local temporary ports, seed only a temporary database, and shut down afterward. Integration tests drop only the database created by their own in-memory replica set; they never read `MONGODB_URI`.

## Manual verification

1. Configure an actual replica-set MongoDB URI, existing session secret, probation hours and optional admin credential. Start backend and frontend with their existing `npm run dev` commands.
2. Use a station owned by a host and a different consumer's confirmed booking whose start time has arrived. Open My Orders (or History within 24 hours after its end), select Report Charging Issue, and submit a category with or without explanation.
3. Confirm PAUSED health, preserved booking, warning in My Orders, and 409 from a direct new-reservation request. Repeat the report and confirm 409, not a duplicate record.
4. Log in as the owner, open Host → Charger Health, and inspect station, category, booking reference and timestamp. Another host must see no access to this incident.
5. Open the incident, describe problem/fix, confirm the test and submit. Confirm PROBATION and expiry. Multiple unresolved incidents must all be resolved first.
6. Use a different confirmed booking with `startAt` after the repair declaration to report the same category during probation. Confirm SUSPENDED, new review flag and no host repair/reactivation path.
7. Use the protected administrative commands to inspect both reports and the repair event, then record a reviewed reactivation decision. Confirm ACTIVE and retained suspension/event history.
8. Check invalid admin credentials, missing consumer sessions, wrong ownership, future/cancelled/older bookings, and duplicate submissions. Test keyboard navigation, mobile form layout, network errors and disabled submit buttons.

## Limits and existing production concerns

- The supplied consumer authentication returns OTPs in API responses and logs them, stores OTPs in memory, and uses development cookie/CORS settings. ChargeGuard reuses this session system as requested; **secure consumer/host authentication must be completed before production deployment**. The separate admin secret avoids inheriting consumer-role escalation, but cannot make existing consumer authentication secure.
- No live deployment, real customer database, physical charger or external notification delivery was tested. Database/browser tests use isolated fixtures, with no mocks in production flows.
- Legacy demo stations with no host can be paused, but cannot deliver an inbox notification to an absent owner or receive an owner repair. Assign real ownership before operating them as live bookable stations.
- Station-level reports cannot prove host dishonesty, hardware failure or physical attendance. A newly created listing is a separate station identity; physical-device/account-wide enforcement is outside this MVP.
- Host and admin queue lists are capped at 200. Administrator per-station detail retains all history. Add pagination for larger operational volumes.
- Health warnings and notifications are eventually visible through 30-second polling; background-browser throttling can delay them. Backend restrictions are immediate on transaction commit.
- No telemetry, AI, QR scanning, per-booking host readiness confirmation, automatic account ban, automatic backups or full dispute-evidence collection is included.
