# Café directory and simpler map

This batch consolidates city, menu category, amenities, reservation availability,
discounts and sorting inside the search bar's Filters sheet. The map header keeps
Home, List and Search. The current-location action sits on the right. The
all-results camera action is in Filters. Active options have a count and survive
reload and map/list navigation through the existing query parameters.

Map-source links remain visible on a single transparent line above the mobile
drawer and at the desktop map's bottom left. The required OpenFreeMap,
OpenMapTiles and OpenStreetMap credits have been retained. The drawer and initial
camera padding use the reduced header height, including short landscape screens.

## Real source integration

The current implementation in the neighboring `ham-ghadam/tools/invara-crawler`
project defines these supported interfaces:

- `POST https://data.hmghadam.com/api/admin/login`, with JSON username/password,
  the panel origin and `X-Requested-With: crawler-panel`.
- `GET /download/stores.json`, with the returned session cookie. This is the full
  `Store` contract; `/api/stores` returns cards without coordinates.
- `POST /api/admin/logout` ends only Vitco's temporary session after the download.

Set private `CAFE_DIRECTORY_USERNAME` and `CAFE_DIRECTORY_PASSWORD` on the Node
server. The credentials and cookie never enter bootstrap JSON or browser code.
Alternatively, set `CAFE_DIRECTORY_FILE` to the absolute path of the crawler's
live `stores.json` on the same server. This takes precedence and needs read-only
filesystem access. Do not copy an old local export and describe it as live.

Only records explicitly categorized `cafe` are imported. The live export inspected
on 2026-11-16 contained 8,700 venues, including 5,077 cafés with coordinates;
its capture time was `2026-11-16T00:07:17.679Z`. Counts may change with later crawls.
The integration preserves stable `invara-<place_id>` identities, exact source
coordinates, addresses, venue photos, source links and published external menu
links. Source tags explicitly map outdoor seating, smoking and work/study to
existing amenity filters. Other source labels remain in the description.

The export has no structured city, phone, opening hours, capacity or priced menu
contract. These are not guessed. Imported records have no operator, capacity,
pickup or booking availability. Empty city values do not create a filter option.
Source ratings/reviews are not presented as reviews submitted to Vitco. A source
listing cannot receive local orders or reservations. Original raw exports,
reviewer details and management records are not exposed through Vitco.

The first catalogue request awaits the first import. Later requests serve the
saved catalogue while a refresh runs at most every 15 minutes. Concurrent first
loads share a request. A failed refresh retains the last successful import and
shows an explicit saved-data notice; failure without a saved import shows an
unavailable notice. Failures retry no more than once a minute. Imports validate
before a transaction, preserve favorites, and never overwrite an operator-owned
record. Missing source records are retained rather than deleting user references.
No source refresh modifies menus, ownership, orders or reservation history.

Lists render 40 results at a time with a More button. Screen-space clusters use
only visible map coordinates, avoiding thousands of off-screen DOM markers.

## Explicit reservation test café

`RESERVATION_DEMO_ENABLED=1` enables **کافه آزمایشی ویتکو · رزرو تست**. It is
disabled by default. A link in the map drawer and Filters opens
`/reserve?cafe=vitco-reservation-demo`. It uses the ordinary authenticated slot,
party-size, table, submission, history and cancellation paths. Requests are real
persisted test records, hold capacity, and remain pending; no café operator will
confirm them. Notices on the listing, detail, booking, success and history views
explain that no real booking is made.

This explicitly requested test venue has no physical coordinates, phone or menu,
and no invented customer activity. Its internal operator has no login credentials.
Online payments, invoices and meal orders cannot be created for it, even if the
gateway is later configured with a wildcard scope. Turning the flag off disables
new bookings on the next server initialization and preserves existing history.

## Validation

Unit coverage checks source mapping, invalid coordinates/URLs, duplicate IDs,
atomic import failure, ownership and favorite preservation, authenticated refresh,
single-flight downloads, stale data retention, and demo capacity, idempotency,
cancellation and payment exclusion. Browser coverage checks imported pins/details,
transparent credits, right-side location, consolidated/persisted filters, and the
complete demo request/history/cancellation flow on desktop and mobile. Automated
browser data uses a reduced fixture of two authentic records from the verified
live export, with its own temporary database and no production credentials.

Normal operator reservation/menu and invoice tests remain in the regression suite.
Full-catalogue local visual checks use the actual live export separately from the
isolated automated browser fixture. No customer requests are sent to real cafés.

Verified locally: 57 unit tests and all 24 desktop/mobile browser tests passed,
along with the production build, type check and formatting check. The complete
5,077-café import was separately checked at desktop, mobile and short landscape
sizes, plus mobile dark mode: no horizontal overflow or browser errors; compact
clusters zoom into individual source cafés. Source credit is 15 pixels high.

The feature release `b1cdf59` was deployed on 2026-11-16 by the successful
[validation and deployment workflow](https://github.com/0xRshia/vitco/actions/runs/43922572646).
The production private directory configuration and explicit demo flag are enabled
in `/etc/vitco/app.env`; credentials remain outside Git and release artifacts.
The environment file and SQLite database were backed up before activation.

Live checks verified all 5,077 mapped source cafés, the preserved original café
and its three products, 15 available demo slots and two configured test tables.
Desktop/mobile browser checks passed for loaded map tiles and source pins,
transparent credits, the location action on the right, the consolidated Filters
sheet, and demo date/time/table selection. No customer reservation or order was
submitted during production verification. Zarinpal remains disabled. The health
endpoint reports the active release commit after subsequent documentation updates.
