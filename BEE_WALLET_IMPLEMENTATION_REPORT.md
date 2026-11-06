# BEE Wallet implementation report

## Completion billing update

This update supersedes the original booking debit, consumer confirmation and demo-label behavior described below. New bookings reserve wallet funds. Successful charging deducts the reserved amount and credits the host in one transaction. Eligible cancellation or a failed outcome releases the reservation. Previously paid bookings retain their payment and settle without another debit.

Set `CHARGING_EVENT_TOKEN` to a secret of at least 32 characters on the backend. The trusted charger integration must send `POST /api/wallet/bookings/:id/complete` with `Authorization: Bearer <token>` and JSON `{ "successful": true }` after charging succeeds, or `{ "successful": false }` if it fails. Keep the token server-side. A charger event source still needs to be connected. A scheduled end time alone does not trigger billing. Wallet recharge continues to add simulated funds.

## Scope and checkpoint

Implemented persistent consumer/host wallets, simulated recharge, atomic booking payments/refunds, verified completion credits, transaction history and host earnings analytics in the existing application. No payment gateway, card fields, bank credentials or real-money transfer was introduced. All wallet transactions and screens are labelled DEMO.

Local Git checkpoint before editing: `0d42219` — `Checkpoint dock-level ChargeGuard before BEE wallet`. No push was performed. Wallet implementation changes remain uncommitted.

## Created files

- `backend/models/Wallet.js`: independent consumer and host wallets, unique `(userId, role)`, INR and nonnegative integer-paise balance.
- `backend/models/WalletTransaction.js`: append-only credit/debit ledger, unique idempotency key, booking/payment links and history indexes.
- `backend/services/wallet.js`: validated paise conversion, decimal tariff arithmetic, atomic balance changes, booking debit and linked cancellation refund/reversal.
- `backend/routes/wallet.js`: authenticated wallet, demo recharge, authoritative quote, successful-session confirmation and earnings endpoints.
- `frontend/src/Components/Wallet.jsx` and `Wallet.css`: dashboard balances, demo recharge review/confirmation, paginated history, checkout payment display, successful charging confirmation and earnings chart.
- `backend/tests/wallet.test.js`: 10 focused API/database scenarios.
- `frontend/tests/wallet-ui.mjs`: browser recharge, history, refresh, completion and host analytics workflow.

## Existing files modified

- `backend/models/Booking.js`: payment snapshot, payment ledger reference, host recipient, request idempotency/fingerprint, separate session outcome and completion timestamp. Existing reservation statuses and dock IDs remain intact.
- `backend/routes/bookings.js`: debit in the existing reservation transaction, request replay, expected-price check and eligible refund inside cancellation transaction.
- `backend/services/chargeGuard.js`: paid failure reports mark the session failed and reverse a previously credited host earning, once, without deleting evidence.
- `backend/server.js`: mounts `/api/wallet` behind the existing session middleware.
- `backend/tests/uiFixture.js`, `backend/tests/chargeGuard.test.js`: initialize wallet indexes and explicitly fund regression-test consumers through DEMO ledger transactions. Fixture-only funds never apply to production accounts.
- `frontend/src/App.jsx`: wallet panels in existing consumer/host dashboards, server quote at booking confirmation, payment details and successful-session confirmation in orders/history.
- `frontend/tests/charging-points-ui.mjs`: optional `--wallet` path proves insufficient funds, recharge inside checkout and exact booking debit.
- `frontend/package.json`: adds `test:wallet-ui`.

No new dependencies, global theme changes, navigation changes or unrelated refactoring.

## Database, security and precision

Wallets are created lazily on first access/use, starting at zero. The same account has separate consumer and host wallets. Only the authenticated session identity is used; client-supplied user IDs/balances cannot select another wallet or change balances.

All persisted balances, payments, earnings and refunds are integer paise. Decimal energy-rate calculation uses BigInt numerator/denominator arithmetic and rounds once to the nearest paise. Minute tariffs use the actual reserved duration, including any permitted buffer. Existing tariff types are retained: per kWh, per minute, per session and energy plus time. The confirmed payment is stored on the booking so later tariff edits cannot change earnings/refunds.

Wallet and ledger changes run in the same MongoDB transaction as the associated booking, completion, cancellation or ChargeGuard report. Conditional atomic balance updates prevent overspending. Failed operations roll back; there is no confirmed booking with a failed debit and no committed debit for a failed booking. Unique wallet, request and ledger keys protect duplicates. Ledger save/update/delete/bulk-update middleware rejects edits; production database permissions should also enforce append-only access for the ledger collection.

Existing MongoDB configuration was checked using only a read-only `hello` command: connection succeeded, transaction-capable topology and logical sessions were confirmed. No live records or credentials were changed by that check. Local deployments need a replica set or sharded MongoDB deployment; standalone MongoDB is not supported for these atomic financial operations. Tests run against isolated replica sets. There is no unsafe nontransactional fallback.

## New API endpoints

All require the existing authenticated session. Wallet POSTs require same-site JSON.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/wallet?role=consumer\|host&page=1` | Own balance and 25 ledger entries per page; `hasMore` supports pagination. |
| `POST /api/wallet/recharge` | `{amount, idempotencyKey}`. INR decimal amount ₹1–₹10,000, at most two decimals. Simulated consumer credit only. Repeated key/amount returns the original entry; changed amount with the same key fails. |
| `POST /api/wallet/quote` | Own saved battery, station/dock, charge range and reserved minutes produce an authoritative paise amount, balance and sufficiency flag. This is not a reservation; all normal booking checks still run on confirmation. |
| `POST /api/wallet/bookings/:id/complete` | `{successful:true}` from the booking consumer, after the session ends. Validates confirmed/paid booking and original ledger payment; rejects cancelled, failed, reported and unpaid historical sessions. Credits the captured host exactly once. |
| `GET /api/wallet/earnings?range=7\|30\|6m` | Own host totals, today/month totals, net completed paid session count, balance and zero-filled day/month series in Asia/Kolkata. |

Existing booking POST accepts an `Idempotency-Key` header and optional `expectedAmountInPaise`. The integrated UI supplies both. Reusing a key for a different booking fails; identical replays return the original booking without another debit. Older callers remain subject to the same booking conflicts and must now have sufficient wallet funds for nonzero prices. Existing historical bookings are not retroactively charged.

## Consumer experience

The existing consumer profile dashboard shows BEE Wallet and Add Money. Recharge offers ₹100/₹200/₹500/₹1000, custom validation, a review step, and a clearly labelled confirmation. A persisted operation key permits safe retry after refresh/network interruption. No payment credentials are requested.

Station details show a server-calculated booking amount and balance before Book. Insufficient funds disable confirmation and provide an inline wallet/recharge option. The quoted amount is rechecked atomically during booking. The station summary becomes nonsticky while checkout wallet details are expanded, and on mobile checkout screens where its height would cover payment controls. This scoped adjustment keeps recharge controls reachable. Existing navigation and other station behavior remain unchanged.

History shows CREDIT/DEBIT, SUCCESSFUL/REFUNDED status, timestamp, amount, description and booking reference. Failed requests show errors without creating misleading committed financial entries. Pending charging sessions are shown separately from successful payments.

## Host completion, earnings and graph

No session-completion system existed. A minimal explicit consumer confirmation was added to paid orders/history. The backend requires the original booking owner, an elapsed end time, a valid successful payment, confirmed booking, host recipient and no charging-failure report. It stores `sessionOutcome=completed` before the linked host credit within one transaction. Creating a booking alone never credits the host.

The host receives 100% of the recorded booking payment. No commission system existed; no platform commission is deducted. The dashboard shows wallet balance, net total/today/month earnings, completed paid sessions, a lightweight chart (no chart dependency), 7/30-day and six-month filters, accessible chart values and private transaction history. The graph uses persisted ledger records, includes zero-earning periods, and refreshes every 30 seconds or immediately on same-page wallet updates/manual refresh.

## Cancellation, failures and existing integrations

The existing cancellation policy remains: cancellation must occur more than one hour before the start. Eligible paid cancellations receive a full linked wallet refund in the same transaction. Duplicate cancellation cannot refund twice. Legacy unpaid bookings cancel without inventing a refund. Completed sessions cannot be cancelled; completion can only happen after the end, already beyond the cancellation deadline.

A failed-session ChargeGuard report prevents completion earnings. If an eligible report arrives after a consumer completion declaration, a linked host DEBIT reversal is appended exactly once and the session becomes failed. Original credit, consumer payment, report and evidence remain intact. Failed sessions do not automatically receive a consumer refund outside the existing cancellation policy; no new dispute refund policy was invented.

No Automatic Backup, payment-transfer or separate dispute-recovery implementation exists in the repository. None was fabricated. Dock health, host repair declarations, probation, suspension and incident audit events are preserved. There is therefore no existing replacement-booking transfer path to adapt; future transfer functionality must explicitly link/reuse the original payment rather than creating an unrelated charge.

## Tests actually executed

Baseline: 32 backend tests passed; frontend production build passed; lint exited 0 with 18 existing warnings.

Final backend: `npm test` — **42/42 passed** (all 32 previous tests plus 10 wallet scenarios). Coverage includes independent wallet creation/privacy, demo validation and concurrent replay, insufficient balance and rollback, precise quote/debit/idempotent booking, concurrent spending, eligible/duplicate refunds and deadline preservation, authorized completion and exactly-once host credit, linked history and all analytics ranges, failed-session exclusion, late-report reversal, ledger immutability and database reconnect persistence.

Frontend checks executed:

- `npm run build`: passed.
- `npm run lint`: exit 0; 18 pre-existing warnings, no new wallet warnings.
- `npm run test:ui-contracts`: 24 passed.
- `npm run test:ev-profiles`: six profiles passed.
- `npm run test:vehicle-types`: passed.
- `npm run test:chargeguard-ui`: passed.
- `node tests/chargeguard-ui.mjs --docks`: passed.
- `npm run test:charging-points-ui`: passed.
- `node tests/wallet-ui.mjs` (also available as `npm run test:wallet-ui`): passed desktop/mobile recharge, refresh, transaction history, paid booking, consumer completion, host earnings and filter persistence; no page errors. Mobile recharge and earnings screenshots were visually inspected.
- `node tests/charging-points-ui.mjs --wallet`: passed the zero-balance → Add Money → server quote ₹72 → Book → remaining balance ₹28 checkout flow on desktop and mobile.
- `git diff --check`: passed.

## Remaining limitations

- All balances and payments are simulated hackathon funds. There is no withdrawal, bank settlement or external gateway.
- Successful completion is an explicit consumer declaration backed by ownership, timing, payment and incident validation; it is not hardware-meter verification. The app has no charger telemetry integration.
- Existing unpaid bookings cannot generate earnings. Demo/legacy stations without a host recipient cannot settle host earnings; the API explains this instead of inventing a recipient.
- Failed-session consumer refunds beyond the current cancellation deadline need an approved dispute/refund policy. Funds remain recorded as paid while host credit is withheld/reversed.
- Failed attempts are presented as errors, not inserted as financial ledger entries; committed successful payments, refunds and adjustments remain immutable.
- The live deployment was not used for payment tests. Only read-only database topology verification used its configuration.
