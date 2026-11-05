# Reference UI implementation — Community EV Charging

## What was changed

The supplied Pilo autonomous-taxi screenshots were used as the visual reference for the Community EV Charging consumer application. The earlier standalone root-level Firebase login frontend has since been removed; the maintained React/Vite app is in `frontend/`, alongside the Node/Express/Mongoose API in `backend/`.

- Reference palette centralized in the maintained frontend with these tokens: neon lime `#C7FE2F`, near-black `#090708`, white `#FFFFFF`, charcoal `#1A1A1A`, pale-gray `#EDEDED`, and neutral surface `#F4F4F4`. The primary source colors were sampled from the screenshots. The precise custom typeface, map artwork, illustration and designer icon assets were not supplied and cannot be reliably recovered from screenshots; the implementation uses available fonts and light embedded SVG icons.
- Updated shell, top bars, mobile navigation, headings, cards, fields, pill controls, CTA buttons, empty/loading/error states, focus visibility, and responsive layouts through shared `reference-tokens.css` / `reference-theme.css` files. Applied the reference palette to legacy `App.css` declarations to avoid older blue/green areas reappearing.
- Applied the new styling to the existing consumer booking and management flows and host dashboard/form without changing database schema, endpoint paths, OTP logic or booking calculations.
- Fixed consumer station loading to use the public `/api/charging-stations` endpoint; added a private host-list fetch from the already-implemented `/api/charging-stations/my` endpoint, and refreshed that list after a successful station save.
- Fixed the host form's submitted `pricePerKwh` key to match the existing backend API. Preserved the server's `pricing.pricePerKWh` field when displaying existing stations.
- Removed a misleading host "Edit" label from a flow that only prefilled the **create** form: that action now says **Use as template**. The backend has no station-update route, so this is explicitly **not editing an existing station**.
- The previous standalone root Firebase signup/login entry point was removed during project restructuring.
- Added independent, no-network frontend contract checks in `frontend/tests/ui-contracts.mjs` and the `test:ui-contracts` npm script.

## Inventory / coverage checklist

Legend: **Styled** = affected by shared and/or dedicated reference-style rules; **Browser** = inspected in an offline Chromium renderer with mocked responses. The browser checks are not confirmation of live backend integration.

| Screen/state documented in the original implementation | Styled | Browser exercised | Notes |
| --- | :---: | :---: | --- |
| Former standalone Firebase login and signup | Historical | No | Removed; the maintained consumer application is in `frontend/`. |
| Consumer landing / welcome actions | Yes | Yes | Mobile and desktop. |
| Consumer login contact form | Yes | Yes | Offline form rendering. |
| Consumer login OTP / countdown | Yes | Yes | Mocked request; no actual OTP delivery or verification. |
| Consumer signup information, step navigation and progress | Yes | Yes | Offline form rendering. |
| Consumer signup OTP / countdown and feedback | Yes | Yes | Mocked request; no real account created. |
| Existing-account and mismatched-contact notices | Yes | No | Shared auth notice and secondary-button styles. |
| Shared header, menu, mobile navigation and logout affordances | Yes | Partly | Navigation exercised; real logout not tested. |
| Consumer profile, photo and account/contact details | Yes | Yes | Shared profile controls. |
| Address add/edit/delete forms and validation | Yes | Partly | Address selection and profile base visited; actual persisted writes not performed. |
| Battery add/edit/delete, connector and power fields | Yes | Partly | Battery selection and profile base visited; actual persisted writes not performed. |
| Booking address / battery picker | Yes | Yes | Includes empty and saved-item selectors. |
| Booking state-of-charge, date, connector filters and search | Yes | Yes | Mock responses only. |
| Compatible charging station list, result count and cards | Yes | Yes | Unit labels preserved. |
| Charging station detail, slot availability and booking controls | Yes | Yes | Details rendered under mocked API data. |
| Booking time-window modal and validation | Yes | Partly | CSS applies; no live booking created. |
| My orders, statuses and cancellation confirmation | Yes | Yes | Page and dialog styling; no real cancel action. |
| Charging history and empty states | Yes | Yes | Mock data in browser smoke. |
| Host dashboard / own-station list | Yes | Yes | Now requests authenticated host list. |
| Host add-station form, feedback and validation | Yes | Yes | Save not submitted against a live backend. |
| Host station template prefilling | Yes | Partly | Creates a new station; no update endpoint in supplied API. |
| Host dashboard loading, empty and API error states | Yes | Partly | Responsive styles applied. |
| Shared disabled, progress, success, validation, dialogs and alerts | Yes | Partly | Common tokens and component-level selectors. |

**Absent from the uploaded application:** host earnings, payout/payment processing, dedicated hardware-operation UI, and live charging-session monitoring. These screens cannot be styled or verified without inventing functionality. Deletion of a host station is commented out in the original host interface and was not enabled. The app's routes use internal React state rather than a URL router; the checklist follows actual conditional screens in `frontend/src/App.jsx` and `Components/`.

## Verification performed

| Check | Outcome |
| --- | --- |
| Original baseline root + frontend Vite build | Blocked: prebundled Windows `node_modules` omitted required Linux Rolldown native binding. `npm ci` also could not retrieve missing packages in this isolated environment. |
| Final root + frontend `npm run build` | **Blocked by same native Rolldown dependency error**; not a verified successful production build. |
| Final `npm run lint` | **Blocked by missing native Oxlint dependency**; no claim of clean lint. |
| `npm run test:ui-contracts` in `frontend` | **12 of 12 pass**. Static regression checks, not integration tests. |
| TypeScript JS/JSX syntax parse | **10 source JS/JSX files, 0 parse errors** (standalone original backup excluded). |
| tinycss2 stylesheet parsing | **8 CSS files, 0 syntax errors**. |
| `node --check` on backend JavaScript | **Pass**, no backend source changed. |
| Chromium offline screenshot checks, 320px, 390px phones and 1280px desktop | Rendered welcome, authentication, OTP, profile, booking selectors/results/details, orders, history, host list and form. No JavaScript page errors or horizontal overflow found in tested states. |
| Live API, MongoDB persistence, Firebase integration, emails/SMS, booking/cancellation writes, hardware/payment flows | **Not performed**. Offline browser scripts used local mock responses solely for visual inspection. |

### Remaining limitations

1. Cannot assert pixel-perfect matching: screenshots, not source design tokens/font files/map graphics, were provided. The principal palette is screenshot-sampled; original custom font and illustrations are approximated using bundled fonts and CSS/SVG.
2. Reinstall dependencies from the lockfiles on a supported machine with internet access before judging Vite build/lint. The supplied archive's `node_modules` contained Windows binaries; those packages are **intentionally excluded** from this deliverable.
3. End-to-end authenticated booking, actual host station saving, and real charging/payment workflows need a configured database, valid credentials and a safe test environment; no real user data was changed.
4. Host "Use as template" creates a new station rather than modifying the previous station because the backend only defines GET/POST/DELETE; do not mistake it for edit.
5. Screenshot testing used an offline React bundle because a normal Vite server could not be started with the provided native dependencies. The referenced frontend image asset exists in `public/`, but its URL was not resolved in the `about:blank` screenshot harness.

## Run instructions

Requires a suitable current Node.js release, internet access for the first npm install, and a configured MongoDB service. Commands below are run from the extracted project directory.

**Backend API**, terminal 1:

```bash
cd backend
cp .env.example .env
# Edit .env with your own MongoDB connection string and a strong SESSION_SECRET.
npm ci
npm run dev
```

**Consumer + host React interface**, terminal 2:

```bash
cd frontend
npm ci
npm run dev
# Open the URL Vite prints (commonly http://localhost:5173).
# The checked-in Vite proxy forwards /api requests to localhost:5001.
```

For final checks, from `frontend`:

```bash
npm run test:ui-contracts
npm run build
npm run lint
```

The backend `.env` from the uploaded archive, all `node_modules`, temporary browser-preview bundles, and original `.git` internals are not included in the export. The safe `.env.example` is provided. The implementation remains reviewable via dedicated theme files and focused React changes.
