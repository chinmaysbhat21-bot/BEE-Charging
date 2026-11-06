# Integrated electric bikes and cars

The existing consumer battery subdocuments and profile endpoints now store `vehicleType` (`bike` or `car`) and optional positive `batteryVoltage`. Missing categories default to car for existing records. Updates from older clients preserve the saved category and voltage when those fields are omitted. Existing ownership checks and duplicate profile-name validation remain in use.

The existing Add Battery form starts with two side-by-side category cards using local SVG vehicle illustrations. Bike selection uses five suggestions; car selection reuses the original six-entry catalog. Both categories support Add Battery Manually and the existing required capacity, chemistry, connector and charging-input fields. Saved profiles show category and voltage. Bike images are generic scooter illustrations, not model photographs.

Changed files: backend/models/consumer.js, backend/routes/consumerAuth.js, frontend/src/App.jsx, frontend/src/data/evBatteryProfiles.js, frontend/package.json. New files: frontend/src/data/bikeBatteryProfiles.js, frontend/src/Components/VehicleTypeSelector.jsx and .css, frontend/tests/vehicle-types.mjs.

Manufacturer references are stored with the bike catalog. TVS 3.5 kWh, Ather 2.7/2.9/3.7 kWh, Chetak C3501 3.5 kWh and Vida V2 2.2/3.44/3.94 kWh are starter variant options, not an exhaustive model-year catalog. Ola capacity is left for manual confirmation. Connectors, chemistry, voltage and input power are not guessed; owners must confirm their specifications. A motor output rating must not be entered as charging input power. Booking compatibility continues to depend on the actual saved connector and power specifications.

Verification completed against isolated MongoDB, without using the application's Atlas database:
- Frontend production build passed.
- Existing 24 UI contract checks and six car profile mappings passed.
- Frontend lint passed with existing warnings.
- New real-browser/API test passed: category persistence, voltage, legacy defaults and updates, duplicate names, invalid category/voltage, mobile and desktop side-by-side cards, five bikes, selected bike capacity, manual bike save, and original car selection.
- Existing backend integration suite: 19 tests passed.

Run `npm run test:vehicle-types` from frontend (install backend dependencies and Playwright Chromium first). Tests start and clean up their own database and HTTP server. No commits or pushes were made. Existing uncommitted ChargeGuard work is retained.
