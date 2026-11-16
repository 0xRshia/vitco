# ویتکو — Vitco

A standalone Persian, RTL café discovery, ordering, and reservation application,
implemented from the supplied `Vitco.fig` flow. First-party branding is Vitco;
imported Vitrin Cafe catalog and asset provenance are retained explicitly.

## Run locally

Requires Node.js 22.13 or newer (Node 24 LTS recommended).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The SQLite database is created automatically at
`data/vitrin.sqlite`. There is no default password, privileged account, fabricated
customer activity, or demo business catalog.

Register with email and password, open **مدیریت کافه**, and add your café and menu.
You can then receive real local orders and reservation requests, update statuses,
create events and coupons, and answer order-related support requests. A separate
customer account can be used to exercise the customer flow.

## Included views and behavior

- Responsive home with invoice-payment guidance, full-screen café map, compact
  searchable/filterable/sortable café lists, café details, real reviews, favorites,
  compact menus, product sizes/addons/notes, and QR/link navigation. The shared
  MapLibre/OpenFreeMap renderer supports Persian labels, clustering, light/dark
  themes, geolocation and a draggable result drawer.
- Email registration/login, optional SMS login/verification, optional email
  password recovery, profile/avatar editing, password changes, and logout.
- Persistent cart, scheduled pickup, coupons, café-specific loyalty points, and
  server-calculated checkout. Address delivery has been removed from new orders;
  existing addresses and historical delivery receipts remain intact.
- Order confirmation, current/history filters, pickup tracking, cancellation,
  reorder, printable receipts, and support.
- Persian calendar, real available reservation slots, party size, booking requests,
  confirmation/cancellation/history, and owner capacity management.
- Events, registration/cancellation with transactional capacity checks,
  notifications, payment information, light/dark preferences, contact/about/privacy/terms.
- Owner management of cafés, images, menu/options, orders, reservations, events,
  coupons, and support replies. An optional trusted support account can handle
  platform-wide support requests.
- Shared menu/location categories, café photo galleries, and café-specific paths
  for reservations/orders and events, including upcoming/ongoing event filters.
- Owner CRM and sales reports with inclusive Tehran date ranges, first Vitco
  orders per café/customer, latest non-cancelled orders, completed-order sales,
  previous-period comparisons, best-selling items, and item counts per customer.
- Category-wide percentage/fixed base-price changes with a server preview and
  stale-preview protection, alongside individual product price editing.
- Owner-configured tables and optional menu preorders submitted atomically with
  a reservation, with the existing payment-at-café method available.
- Optional Zarinpal payments, enabled only for an explicitly configured merchant,
  environment, café scope, and callback origin. The current local setup does not
  enable live payment.
- In-person invoice payment: select a café, enter its bill amount in toman, review
  real automatic/coupon discounts, and select the configured online gateway.
  Owners set the automatic percentage. The larger discount applies without
  stacking; paid invoices settle only after provider verification.

See [the map, catalogue and invoice refresh](docs/browse-invoice-refresh.md) for
the current browse flow, preserved behavior and validation.

See [the expansion requirements and verification](docs/cafe-management-expansion.md)
for report definitions and integration details.

See [design coverage](docs/design-coverage.md) for the mapping from the source
frames to implemented routes and states.

## Real data and assets

`src/lib/source-catalog.json` is a public snapshot retrieved on 2026-10-04 from
https://vitrincafe.ir/cafes/kafh-aaala. It includes کافه اعلا and its three published
menu items with their published prices in **toman**. Imported listings are clearly
attributed and browse-only: this app has no integration with that site's order
processing. Imported availability does not authorize accepting orders for it.

Brand illustrations are bundled locally from Vitrin Cafe's public site. Missing
café/product images are explicitly labelled as missing. No unrelated stock photos,
ratings, discounts, customers, orders, or reservations are invented. The source
Figma archive itself remains in the user's Downloads directory and is not copied
into the repository. Its checkerboard screenshots are not used as app assets.

## Optional services

| Environment variable                      | Purpose                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `DATABASE_PATH`                           | Persistent SQLite file; default `./data/vitrin.sqlite`                          |
| `APP_ORIGIN`                              | Canonical origin; set the real HTTPS origin for deployment                      |
| `KAVENEGAR_API_KEY`, `KAVENEGAR_TEMPLATE` | Real Kavenegar Verify Lookup SMS login                                          |
| `RESEND_API_KEY`, `MAIL_FROM`             | Real Resend password-recovery email from a verified sender                      |
| `SUPPORT_USER_ID`                         | UUID of a trusted existing account allowed to read/reply to all support tickets |
| `ZARINPAL_MERCHANT_ID`                    | Complete merchant UUID; keep private and out of tracked files                   |
| `ZARINPAL_ENV`                            | Explicit `live` or `sandbox`; sandbox does not charge real money                |
| `ZARINPAL_CAFE_IDS`                       | Comma-separated café IDs without spaces, or explicit `*` for all managed cafés  |

SMS and recovery screens explicitly explain when their service is not configured.
No verification codes are exposed through the API or logs. Codes expire and are
rate-limited. No external SMS, recovery email or bank transaction was performed
during local validation.

Payment **at the café** remains available for menu orders and reservations. Optional Zarinpal online
payment requires complete valid configuration and a public HTTPS callback origin
for live use. All enabled cafés use one configured merchant account; separate café
payouts and automatic split settlement are not implemented. Cancelling a paid
order does not automatically refund a payment.

The preview target is `vitco.hmghadam.com` on the existing VPS, with all three
`ZARINPAL_*` variables empty and live payment disabled. The future `vitco.ir` domain
has not yet been purchased. Live activation requires domain ownership, deployment
with HTTPS, updating the terminal's registered domain from the reported
`vitrincafe.ir`, and confirming server-IP settings. No live or external sandbox
transaction has been run. See [Zarinpal configuration and payment
operations](docs/zarinpal-payments.md) for the provider contract and limitations.

Reservations are requests until the café owner confirms them. Each reservation
holds capacity for one hour. Owner hours currently support a single same-day
opening interval. Owners can configure named tables with seat counts; cafés
without configured tables continue using overall capacity. Cancelling a booking
also cancels its pending meal order. Customers must contact the café if meal
preparation has already started. An ongoing event requires an explicit end time;
existing events with no end time are not assigned an invented duration.

Sales reports use completed orders and settled invoices placed in the selected range; item revenue
uses historical item prices before discounts. The new-customer metric counts
the first non-cancelled Vitco order at each café, not an external referral or
visit. Detailed report intervals are limited to ten years. Bulk tax/inflation
adjustments change base menu prices; they do not calculate a separate tax line.
Unpaid invoice drafts are excluded from analytics. Settled invoices never create
fictional product quantities or item/customer frequencies.

QR camera scanning uses the browser's `BarcodeDetector` when
available; entering a valid local café/product link also works.

## Persistence and security

- SQLite WAL, foreign keys, prepared statements, and immediate transactions.
- Salted scrypt password hashes; hashed, expiring HttpOnly session cookies.
- Same-origin checks for browser mutations, input validation, request limits,
  rate limits, and per-record user/owner authorization.
- Server-side product/options/quantity validation and price calculation. Order
  and reservation submission keys prevent duplicates. Completion/refund effects
  are guarded by state transitions.
- Booking and event capacity is checked inside a transaction.
- Image uploads accept size-limited PNG/JPEG/WebP signatures, are named by the
  server, and are served with explicit image content types.
- `data/`, `.env.local`, upload files, build output, and test results are ignored
  by Git. Back up the database (including WAL consistently) and `data/uploads`.

### Learning notes — why these choices matter

A café can issue and accept only its own loyalty points. The profile shows an
aggregate balance, while checkout uses that café's balance. This prevents a café
operator from manufacturing discounts redeemable against another business.

Imported public listings remain separate from operator-managed cafés. This avoids
pretending that an unrelated live business receives orders from a new standalone
application. Café ownership is scoped to the creating account; there is no public
claim mechanism for imported listings.

SQLite is suitable for a **single long-lived Node server with persistent storage**.
For multiple application replicas or serverless deployment, replace it with a shared
transactional database. The native SQLite API emits an experimental warning on
Node 22; this is not a failed build.

## Validate

For configuration checks that do not send messages or print credentials:

```sh
npm run check:readiness
npm run check:readiness -- --production
```

The production check requires a canonical public HTTPS `APP_ORIGIN`. Optional SMS,
email, and Zarinpal may remain disabled; a partially configured provider is an
error. Live Zarinpal requires a public HTTPS origin even in the local readiness
check. No readiness check sends a provider request or validates domain ownership.
This check does not validate provider credentials or guarantee production readiness.
See [the current preparation and verification report](docs/release-readiness.md).

```sh
npm run typecheck
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
npm run format:check
```

Unit tests cover pricing, invalid options, imported-listing restrictions, coupons,
points/refunds, ownership, state transitions, duplicate submissions, reservation
capacity, café-scoped loyalty, and password verification. Browser tests run the
production server on port 3100 with a **separate temporary database**, checking
public routes, desktop/mobile layout, auth, café/menu setup, checkout, reservations,
addresses, favorites, product options, coupons, rejection of new address delivery,
invoice quotes and discounts, map selection/drawer/filters, event capacity, support
replies, reviews, and security boundaries between customer and owner accounts.
Test accounts never enter the app's normal database.

## Production

```sh
npm ci
npm run build
npm run start
```

Place behind an HTTPS reverse proxy, set `APP_ORIGIN`, persist `data/`, configure
provider credentials as needed, and register real café accounts. The current preview
at https://vitco.hmghadam.com and automatic main-branch deployments are described
in [preview operations](docs/vitco-preview-deployment.md). The earlier dev.rshi.info
deployment is documented separately in [historical deployment operations](docs/deployment.md).
