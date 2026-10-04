# ویترین کافه — Vitrin Cafe

A standalone Persian, RTL café discovery, ordering, and reservation application,
implemented from the supplied `Vitco.fig` flow and Vitrin Cafe's identity.

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

- Responsive home, search, café directory/filter/map links, café detail, real
  reviews, favorites, menus, product sizes/addons/notes, and QR/link navigation.
- Email registration/login, optional SMS login/verification, optional email
  password recovery, profile/avatar editing, password changes, and logout.
- Persistent cart, delivery/pickup selection, address CRUD/geolocation, scheduled
  pickup, coupons, café-specific loyalty points, and server-calculated checkout.
- Order confirmation, current/history filters, delivery/pickup tracking, cancellation,
  reorder, printable receipt, and support.
- Persian calendar, real available reservation slots, party size, booking requests,
  confirmation/cancellation/history, and owner capacity management.
- Events, registration/cancellation with transactional capacity checks,
  notifications, payment information, light/dark preferences, contact/about/privacy/terms.
- Owner management of cafés, images, menu/options, orders, reservations, events,
  coupons, and support replies. An optional trusted support account can handle
  platform-wide support requests.

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

SMS and recovery screens explicitly explain when their service is not configured.
No verification codes are exposed through the API or logs. Codes expire and are
rate-limited. External delivery was not exercised because no provider credentials
were supplied.

Payment is **at the café or on delivery**. No card is charged or collected.
Online payment requires a separately selected payment provider and credentials.
Reservations are requests until the café owner confirms them. Each reservation
holds capacity for one hour. Owner hours currently support a single same-day
opening interval. QR camera scanning uses the browser's `BarcodeDetector` when
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
addresses, favorites, product options, coupons, delivery, event capacity, support
replies, reviews, and security boundaries between customer and owner accounts.
Test accounts never enter the app's normal database.

## Production

```sh
npm ci
npm run build
npm run start
```

Place behind an HTTPS reverse proxy, set `APP_ORIGIN`, persist `data/`, configure
provider credentials as needed, and register real café accounts. The deployment at
https://dev.rshi.info is described in [deployment operations](docs/deployment.md).
No remote push or other GitHub mutation has been performed.
