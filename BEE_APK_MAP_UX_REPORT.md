# BEE APK Find Charger UX review

## Changes in this pass
- frontend/src/main.jsx adds a Capacitor-native class for Android-only layout rules.
- frontend/src/Components/ChargerMap.jsx adds continuous handle dragging, three snap positions, cancellation cleanup, and a half-open initial sheet.
- frontend/src/Components/ChargerMap.css places Android discovery between the existing app bars, floats search and preferences, sizes station rows, and resolves expanded-sheet control overlap.
- Existing uncommitted map integration in App.jsx and Leaflet dependency changes are retained.

## Verification actually performed
- Vite production build passed.
- Chromium browser exercised the native presentation class at 360 x 800, 390 x 844, and 412 x 915, capturing all three sheet positions.
- Inspected the 390px native-layout screenshot. Corrected an expanded-sheet handle obstruction and a refresh toolbar covering the filter.
- Browser flow passed map tile loading, marker-to-card selection, station details, charging-time dialog, orders, history, host listing/form, and responsive overflow checks.
- Existing ChargeGuard browser test passed report, risk warning, history form, host repair and probation.
- Native layout testing used the browser with the Capacitor presentation class. No new APK was installed, and this pass did not run an emulator or test physical-device gestures.
- This pass did not exercise every requested signup, cancellation, or backup scenario.

## Limits
- Render and the phone APK still serve the previous committed version.
- The map uses the existing station API response. No new viewport backend endpoint was introduced.
- Existing slot checks determine bookable counts for the chosen vehicle/date/charge request. These are not charger telemetry.
- Vite reports a main bundle over 500 kB. Lazy-loading remains a potential performance improvement.
- Physical Android keyboard, cutout, Back, and drag verification remain outstanding before APK release.

## Change control
Backend business logic, database models and records, authentication and booking rules were not edited.
The user authorized a local commit after review. Previous revision: 62e6f46 (Let hosts use current location for chargers). The map changes are grouped in one commit so they can be undone with git revert. Publishing remains pending.
