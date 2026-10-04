# Vitrin Cafe implementation

## Research

The repository began empty. The supplied Vitco.fig has 12,338 nodes. The UI kit
contains light/dark variants of home, phone/email authentication, profile setup,
delivery/pickup menus, address CRUD/map, store search/favorites/details, product
options, delivery/pickup cart, coupon/points, order success/history/tracking/support,
profile/settings/payment, table booking/date/time/party selection, and reservations.
The embedded screen previews use checkerboard image placeholders. These are not
reused as application assets. The actual site supplies Persian identity, brand
photography, café discovery, events, and editorial concepts.

Vitrin Cafe's homepage lists no featured cafés, but /cafes and
/cafes/kafh-aaala expose one public café and its three menu items. Import only
observed fields, preserve provenance, and do not claim imported data is live or
accept orders on behalf of that unrelated system. No ratings, discounts, orders,
customers, addresses, or reservations are fabricated.

## Plan

1. Next.js App Router, TypeScript, shared responsive components, CSS tokens,
   locally bundled Vazirmatn, Persian text/numbers/calendar, RTL, light/dark modes.
2. SQLite with prepared statements, real password/session auth, ownership checks,
   server-side pricing, transactional inventory/capacity/points validation.
3. Customer flows and their empty/error/loading/success variants.
4. Owner workspace: actual café, menu/options, coupons, events, order transitions,
   reservation management. No privileged default account or fixture business data.
5. Optional real SMS and mail adapters. Explicit unavailable states without keys.
   Pay at the café/on delivery; do not pretend to charge cards.
6. Unit/integration and browser validation of persistence, authorization, checkout,
   reservations, responsive layout, and Persian text.

## Decisions

The user explicitly selected a standalone application with its own database.
SQLite suits a single Node server with persistent storage; serverless/replicated
deployment requires changing the persistence layer. Imported cafés are read-only;
users can register their own cafés and manage only records they own. Desktop adds
a navigation rail; mobile retains the original design's bottom navigation.
