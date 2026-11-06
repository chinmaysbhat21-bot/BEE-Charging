# Host and multi-point charging implementation

Implemented locally, 6 November 2026. No commit, push, environment-variable change, or live database seed was performed. Earlier ChargeGuard and vehicle-category changes are retained.

## Implemented

- Hosts create mixed car/bike stations through the existing station form. Each charging point has an independent ObjectId, name, category, AC/DC mode, power, exact connector list, per-kWh tariff, alternative-connector count, and availability.
- One point accepts one simultaneous reservation. Alternative plugs on that point do not imply simultaneous charging. Independently bookable sockets should be entered as separate points.
- Point model selection reuses the existing six-car and five-bike catalogs. Hosts can add optional brand, model, capacity, voltage and chemistry restrictions manually. An empty restriction list still requires a matching category and connector; it does not bypass compatibility.
- New station-level network selection supports Sunfuel, REIL, Torrent, eFill, Statiq, Powerbank, Vaari Energy, KIA, Other and HPCL. Other requires a name. Blank remains valid for legacy/independent stations. Network icons use the user-supplied reference screenshot as a CSS sprite, preserving the supplied artwork. These are screenshot-resolution assets; independent stations retain a neutral dash.
- Hosts can manage points on existing stations, add or remove unused points, change availability, and review car/bike/available/occupied counts. Refresh availability updates the snapshot. Specifications and tariffs cannot change while active/upcoming reservations exist. Any point with booking history cannot be deleted; mark it offline instead.
- Consumers retain one parent-station card/location and the existing map navigation. Station vehicle-facility filtering is available. Within a station, the point selector shows compatible points, individual power/connector/tariff/status and independent free time windows. The saved vehicle determines actual point compatibility even when the station-facility filter is changed.
- The backend requires the selected point ID for upgraded stations, validates category/connector/model/battery restrictions, checks the duration against that selected point's power, and rejects overlapping reservations. Different points can be reserved simultaneously by different batteries. The existing cross-station battery-overlap restriction remains.
- Bookings store parent station, point ID, point name and per-kWh price snapshot. Existing cancellation deadlines remain. Cancelling a point booking releases only that reservation and does not modify other points' slots.
- ChargeGuard continues to apply to the entire station, including all points. Changing point availability cannot bypass PAUSED/SUSPENDED health restrictions.

## Data compatibility and tradeoffs

`ChargingStation.chargers` is extended instead of introducing a disconnected charger collection. New station fields are `pointBookingEnabled`, `chargingNetwork` and `otherNetworkName`. Existing charger IDs remain stable when hosts edit them. Existing electrical metadata, such as voltage/current/phase, is retained by the management endpoint.

`pointBookingEnabled` defaults to false. Old stations continue using their original station-level availability and pricing until a host explicitly configures points. Existing car records default to the car category. Legacy stations are not silently advertised as bike-compatible.

`Booking.chargingPointId` defaults to null. Historical reservations are not assigned to an invented point: confirmed legacy reservations conservatively block all points during their original interval. Existing station availability windows and unavailable/booked slots remain effective when enabling points. New point-enabled stations use their opening hours, with free intervals derived from actual bookings. The consumer API publishes a rolling 31-day availability view; legacy stations with explicit schedules retain those schedules rather than being automatically extended.

The existing MongoDB transactions and station/consumer document writes serialize conflicting changes across server processes. Removal and booking cannot race past each other; station deletion now also checks history within a transaction. MongoDB replica-set support is required, as in the previous booking implementation.

Compatibility is shared between browser and backend in `shared/chargingPoints.js`. Specific model names, optional exact capacity/voltage and known chemistry restrictions are enforced. Unknown required battery values fail matching. Generic connector labels such as `Other` do not establish electrical compatibility. The consumer battery form now also accepts exact connector names for custom/OEM interfaces. A charging-point rating is an upper bound; actual booking duration uses the saved vehicle's charging-input limit. Motor output ratings are not charging-input limits.

New/converted point tariffs are per-kWh. Existing station-level pricing models continue unchanged until explicit point configuration; older reservations and their history are preserved. There is no new payment processor or telemetry integration. Network affiliation is host-declared, not externally verified.

## API

- `POST /api/charging-stations`: accepts `chargingPoints`, `chargingNetwork`, `otherNetworkName` alongside the existing address, coordinates, type, opening hours and amenities. Older single-charger payloads remain accepted. Server assigns IDs for newly created points. Between 1 and 50 points is permitted.
- `PUT /api/charging-stations/:id/points`: owner-only transactional update of network and point configurations. Existing `_id` values must be retained. New points omit `_id`; arbitrary or duplicate IDs are rejected. Historical-booking removal and upcoming-booking specification edits return 409.
- `GET /api/charging-stations` and `/my`: continue returning one station per location. Point-enabled stations additionally expose `chargers[].occupied` and `chargers[].timeSlots`, without exposing other consumers' booking identities.
- `POST /api/bookings`: point-enabled stations require `chargingPointId` in addition to the existing station, battery, date/time and charge values.
- `DELETE /api/bookings/:id`: existing consumer cancellation route; handles both old station-wide reservations and new point reservations.
- `GET /api/bookings/my`: includes stored point identity/name/tariff snapshots.

## Files

- `backend/models/ChargingStation.js`, `backend/models/Booking.js`: backward-compatible fields and point-overlap query index.
- `backend/routes/chargingStations.js`, `backend/routes/bookings.js`: creation, management, availability, compatibility, concurrency and cancellation integration.
- `backend/services/chargingPoints.js`: point/network validation, schedule projection and edit safeguards.
- `shared/chargingPoints.js`: shared compatibility, network names and point-specific station projection.
- `frontend/src/Components/ChargingPointEditor.jsx`, `.css`: network selector, dynamic point form and host point manager; isolated styles using the BEE tokens.
- `frontend/src/data/chargingPointDefaults.js`: new-point defaults.
- `frontend/src/App.jsx`: existing host form and dashboard integration, consumer selection, category filter, point booking payload and exact battery connector input.
- `backend/services/demoChargingPoints.js`, `backend/scripts/seedMangalorePoints.js`: safe 15-station importer.
- `backend/scripts/seedChargingStations.js`: original seed now uses insert-only defaults so repeating it cannot overwrite existing charger IDs, slots, status or configuration.
- `backend/tests/chargingPoints.test.js`, `frontend/tests/charging-points-ui.mjs`, `frontend/package.json`: automated verification and browser-test command.

## Demo data: pending the supplied Mangalore list

The repository contains 15 Anantapur demo stations (`ATP-DEMO-001` through `015`). The user chose to supply a Mangalore list instead of repurposing these records. The repeated attachment contains the specification but no station list or coordinates. Therefore **the actual Mangalore demo data has not been imported or invented**. Existing coordinates have not changed.

Supply a JSON array of exactly 15 rows with these fields:

```json
{
  "stationCode": "MLR-DEMO-001",
  "name": "Station name",
  "area": "Existing Mangalore locality",
  "address": "Existing address",
  "coordinates": [null, null]
}
```

Replace both nulls with the original numeric longitude and latitude. Use unique codes through `MLR-DEMO-015`. The importer adds varied 2–4-point configurations for new stations, with both car and bike points and fictional network assignments. Bike demonstration outlets explicitly require an owner-supplied compatible OEM charger. These are fictional configurations, not verified physical infrastructure.

From `backend`:

```powershell
# Validate only; no database connection or write:
node scripts/seedMangalorePoints.js path-to-mangalore-list.json
# Apply the reviewed list using the existing configured database:
node scripts/seedMangalorePoints.js path-to-mangalore-list.json --apply
```

The importer validates the complete list first and applies it transactionally. New point IDs are deterministic; repeat runs preserve existing configured points. Existing legacy demo points are retained when upgrading. It rejects coordinate changes and user-owned/non-demo station collisions. No users, unrelated stations or booking records are deleted. “Exactly 15” describes the Mangalore dataset; unrelated pre-existing Anantapur records are not deleted to force a global collection count.

## Actual verification

- Backend: **28/28 tests passed**, including 19 existing ChargeGuard tests and nine new multi-point tests.
- New cases cover mixed station/network creation, invalid inputs, ownership, car/bike mismatch, manual compatibility, same-point concurrent conflicts, parallel bookings on different points, battery overlap, point-ID and tariff snapshots, occupied/offline behavior, cancellation isolation, stable IDs, removal/edit safeguards, legacy station-wide bookings, and the repeatable 15-station import with coordinate/unrelated-record preservation.
- Browser: host creation and management, three points with mixed categories, Other network, existing car/bike catalogs, manual voltage, consumer category filtering, selecting the second car point and completing a real reservation all passed against an isolated MongoDB replica set and the real API/session routes.
- Host layouts checked at 390, 768 and 1440px; consumer list/point-picker overflow checked at 390px. Screenshots generated in `frontend/test-results/charging-points/` and inspected. Scoped CSS fixes make the selected vehicle distinct despite older global host button rules.
- Existing vehicle-category and ChargeGuard browser workflows passed.
- Frontend build, 24 existing UI contract checks and six existing car-profile mappings passed. Lint exits successfully with the same existing warnings; no new component warning remains.
- `git diff --check` passed. No live Atlas data was used for tests, and no physical-device behavior is claimed.

Commands: `npm test` in backend; in frontend run `npm run build`, `npm run lint`, `npm run test:ui-contracts`, `npm run test:ev-profiles`, `npm run test:vehicle-types`, `npm run test:chargeguard-ui`, and `npm run test:charging-points-ui`. Browser tests require Playwright Chromium (`npx playwright install chromium`) and installed backend dependencies.
