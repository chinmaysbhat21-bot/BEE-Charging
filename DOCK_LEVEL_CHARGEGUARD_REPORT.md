# Dock-level ChargeGuard implementation

## Result

New reports on dock-assigned bookings affect only the booked dock. Existing charging points (`ChargingStation.chargers[*]._id`) are the docks; no competing model or replacement identifiers were introduced. Station closure and historical station-wide ChargeGuard restrictions remain separate.

Recoverable local Git checkpoint before implementation: `f6e80da` (`Checkpoint existing BEE application before dock-level ChargeGuard`). This captures the preceding application changes, including provider icons and removal of supported-model controls. No push was performed. Implementation changes remain uncommitted. No live Atlas records or credentials were changed.

## Files modified

- `backend/models/ChargingStation.js`: independent embedded dock health.
- `backend/models/ChargingIncident.js`, `backend/models/IncidentEvent.js`: immutable dock identity, name and connector snapshots; scope indexes.
- `backend/services/chargeGuard.js`: scoped reporting, repairs, repeat detection, expiry and administrative reactivation.
- `backend/routes/chargeGuard.js`: dock-aware notifications, host history and administrator review results.
- `backend/routes/bookings.js`: dock booking enforcement and dock health/connector details on existing booking responses.
- `backend/services/chargingPoints.js`: faulty docks have no available booking windows; healthy docks remain independent.
- `shared/chargingPoints.js`: shared UI dock availability predicate.
- `frontend/src/App.jsx`: booking choices exclude paused and suspended docks.
- `frontend/src/Components/ChargeGuard.jsx`: assigned dock identification, scoped warnings and incident/repair presentation.
- `frontend/src/Components/ChargingPointEditor.jsx`: dock health badges and accurate available counts.
- `backend/tests/chargeGuard.test.js`: four focused dock integration scenarios in addition to existing coverage.
- `backend/tests/dockReloadProbe.js`: fresh backend process verifies persisted lifecycle state through the protected review API.
- `frontend/tests/chargeguard-ui.mjs`: optional `--docks` workflow and refresh assertions.

## Database and compatibility

Each existing charger subdocument gains `chargeGuard` with ACTIVE/PAUSED/PROBATION/SUSPENDED, repair/probation/review timestamps and suspension history. Missing health defaults to ACTIVE. Station health and operational `status` retain their original meaning.

Incident and append-only event records gain nullable `chargingPointId`, `chargingPointName`, and `connectorTypes`. Old records stay station-scoped with no invented dock. New indexes support station/dock incident and event history. The existing unique booking/category index is retained: one booking has exactly one assigned dock, so this also prevents duplicate booking/dock/issue reports without replacing a live index.

Existing booking IDs, dock IDs, reservation conflicts, cancellation, pricing and compatibility behavior are preserved. Parent-document transactions serialize report/booking/edit races. Host point edits preserve server-owned health and cannot reset it by submitting ACTIVE. Existing booked-point removal protections retain incident-linked docks because every report requires a booking.

## API behavior

- Existing `POST /api/chargeguard/reports` derives station and dock from the authenticated customer's eligible booking. Optional `stationId` and `chargingPointId` must match. Invalid IDs and unrelated docks are rejected. Successful response identifies the dock.
- Existing repair endpoint derives its target from the incident, never a client-selected dock. Pending incidents and independent same-category post-repair repeats are scoped to that dock. Default probation remains exactly 24 hours; existing configuration behavior is preserved.
- Existing protected `POST /api/chargeguard/admin/stations/:id/reactivate` accepts `chargingPointId` for a suspended dock. Omitting it retains historical station-level administration. Authorization is unchanged. Only incidents in the reviewed scope are resolved.
- Host incident and administrator review reads include embedded dock health. Suspended docks appear in the administrator review queue even when station health is ACTIVE.
- Existing booking APIs reject PAUSED/SUSPENDED docks, allow ACTIVE/PROBATION according to normal availability, and still enforce station closure. Dock-specific windows exclude unhealthy docks without suppressing healthy neighbors.

## UI

The existing report form shows station, assigned dock and connectors. The assigned dock is fixed, not selectable. Host incident cards show dock identity, scoped health, repair declaration and probation timing. Existing station point details show each dock's health. Booking selectors disable unhealthy docks. No global styles, palette, fonts, navigation, dependencies or page layouts were changed.

Notifications remain the existing host Charger Health polling interface (30 seconds), now identifying the dock. No email/SMS notification system was added.

## Executed checks

Baseline before implementation: backend 28/28 passed; frontend build, lint, 24 UI contracts and six EV profile mappings passed. The original combined baseline browser run lost its process handle, so its completion is not claimed.

Final verification:

- Backend `npm test`: **32/32 passed**, including all 28 prior tests.
- Frontend `npm run build`: passed.
- Frontend `npm run lint`: exit 0, same 18 existing warnings; no new lint warnings.
- `npm run test:ui-contracts`: 24 passed.
- `npm run test:ev-profiles`: six profiles passed.
- `npm run test:vehicle-types`: passed real session/API persistence and mobile/desktop vehicle workflows.
- `npm run test:charging-points-ui`: passed station creation/editing, network, independent point selection and reservation.
- `npm run test:chargeguard-ui`: passed historical station report/repair workflow and page refresh.
- `node tests/chargeguard-ui.mjs --docks`: passed assigned Dock 3 reporting, owner repair, probation, neighboring ACTIVE docks, mobile/desktop overflow/focus, refresh persistence and no page errors. Mobile screenshot was visually inspected.
- `git diff --check`: passed.

The five-dock test confirms Dock 3 alone becomes PAUSED, a second consumer reserves Dock 4 through the real booking API, host repairs Dock 3 into 24-hour PROBATION, a third consumer's eligible independent booking triggers SUSPENDED on Dock 3, host repair cannot bypass suspension, and authorized administrator review reactivates only Dock 3. Reporting bookings are test fixtures with eligible timestamps; real reservation and concurrency checks run through the booking API. Separate fresh backend processes read PAUSED, PROBATION, SUSPENDED and ACTIVE from the same isolated database through the protected administrator API. A database disconnect/reconnect also verifies incident identity and events. Browser refresh checks reload the actual host/consumer UI.

Additional tests cover malformed/unrelated dock IDs, station mismatch, duplicate concurrent reports, per-dock unresolved issues and expiry, malicious host health edits, station closure, legacy records, cancellation and simultaneous reservations. Tests use isolated MongoDB replica sets, never the user's Atlas database.

## Limitations and existing integrations

- A historical booking without a dock assignment cannot establish which dock was used. At a station now using independent docks, new reports from such bookings fail clearly and direct the customer to the host; no dock is guessed and no healthy dock is paused. There is no existing session-evidence source permitting a legitimate dock selection. Historical station reports remain accessible and repairable. Legacy stations still retain their original report workflow.
- Independent station-wide closure or an unresolved historical station-wide restriction can still block every dock intentionally; a new dock report does not create that restriction.
- No Automatic Backup, payment-transfer, Failed Session Recovery or separate dispute-evidence implementation was found in backend/frontend source. None was invented or rebuilt. Existing incident descriptions, repair declarations, review history and append-only evidence remain intact with dock links.
- Restart verification uses fresh isolated backend processes and the actual route/model modules. The live production server and Atlas deployment were not restarted or exercised.
- Existing report eligibility, category definitions, probation configuration, notification polling, history result limits and administrator-token requirements remain unchanged.
