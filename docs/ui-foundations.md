# Vitco shared UI foundations

Stage one updates shared presentation, with page composition and existing business
flows retained for later stages. The visual direction is neutral surfaces, dark
primary actions, peach selection accents, and Persian RTL typography.

## Source and fidelity

Reference: https://www.figma.com/design/FHj11PjuQvgsPG13gR61be/Vitco

Representative Home, Profile, Cart pickup, and reservation screens were inspected
in the public browser view. Figma MCP session/design-context reads were denied
because the connected account lacks access. The values in `ui-foundations.css`
are implementation choices based on the agreed direction, **not extracted Figma
tokens or a claim of pixel-exact matching**. Exact token reconciliation and the
original logo asset remain pending access. The existing coffee icon is retained
and restyled; no replacement for the reference logo has been fabricated.

## Reuse

`src/app/ui-foundations.css` owns shared tokens and component appearance. It is
imported once after the existing page/layout CSS in the root layout. Add future
page composition in page styles; keep common control and theme changes here.

| Purpose                       | Tokens / existing component                                              |
| ----------------------------- | ------------------------------------------------------------------------ |
| Page, card, inset backgrounds | `--bg`, `--surface`, `--surface-alt`                                     |
| Text and dividers             | `--text`, `--muted`, `--line`                                            |
| Primary action                | `--primary`, `--primary-hover`, `--on-primary`; `.button.primary`        |
| Peach selection and emphasis  | `--accent`, `--peach`, `--peach-strong`                                  |
| Feedback                      | `--danger`, `--on-danger`, `--green`, `--sage`, `--info`, `--lavender`   |
| Keyboard focus                | `--focus`                                                                |
| Spacing                       | `--space-1` through `--space-6`: 4, 8, 12, 16, 24, 32 px                 |
| Corners                       | `--radius-sm`, `--radius-md`, `--radius`, `--radius-lg`, `--radius-pill` |
| Type                          | `--font-body`, `--text-xs` through `--text-title`                        |
| Forms                         | `Field`, `Form`, `Submit`; 48 px common control height                   |
| Cards and choices             | `.panel`, `.product-card`, `.cafe-card`, `.option-row`, `.segmented`     |
| Brand                         | `Brand`; Vitco wordmark with the existing coffee mark                    |

Both themes define their own semantic colors. Avoid using an accent as the primary
button background; use the primary/on-primary pair. Vazirmatn remains bundled
locally, with the existing 400–800 weights. Mobile text fields use 16 px type to
avoid automatic input zoom. Search wrappers receive a shared focus ring.

Mobile navigation uses 44 px or larger common icon targets, an active icon pill,
section highlighting for product/account subpages, bottom safe-area spacing, and
reserved content space. Scanner access remains available from the navigation
drawer. No ordering, payment, reservation, or authentication behavior is added.

External Vitrin Cafe source credits and image provenance are intentionally kept
under their original name; first-party application branding is Vitco.

## Validation

- TypeScript and production build.
- Browser inspection at 320 px and 393 px, and the default desktop viewport.
- Visible shared controls, cards, navigation, and theme switching.
- Core public routes checked for RTL and horizontal overflow.

The foundation pass did not change page composition. Stage two subsequently adds
the home/profile layouts in `src/app/home-profile.css`, a shared `LoyaltyCard`,
account and guest states, actual recent-order data, and profile editing through
the existing API. Loyalty tiers, maps, payment services, and exact Figma token/logo
reconciliation remain outside these two stages.

Stage two was additionally checked using a separate SQLite database and server on
port 3101: login, an empty order history, profile name persistence, a completed
order earning 10 points, home search, and light/dark layouts. The normal database
and public catalog on port 3000 were not populated with test data. Screenshots of
the authenticated state therefore show explicitly named test accounts/cafes.

## Stage three: purchase journey

`src/app/commerce.css` owns the menu, product configuration, cart, order confirmation,
history, and tracking presentation. The existing ordering APIs remain responsible
for prices, stock restrictions, discounts, points, and state transitions.

- Menu filtering includes a result count, pressed states, unavailable-product
  labels, and a cart dock when the cart contains items.
- Product configuration has a mobile purchase bar and a confirmation sheet with
  actual selected options, quantity, and price. Imported catalogs remain browse-only.
- `Modal` accepts an optional `presentation="sheet"`; its default remains a dialog.
- Cart item removal requires confirmation. Coupon and pickup scheduling controls
  use separate sheets. An expanded Persian calendar uses the sheet's full width.
- Guests see an explicitly estimated subtotal instead of an endless loading label.
  The server quote remains authoritative after login.
- Checkout login/sign-up preserve `next=/cart`. Stage four also allows the local
  `/reserve` path with its query; arbitrary redirect URLs are not accepted.
- Tracking renders actual server stages with `aria-current="step"`. Refreshing
  also updates account rewards through the existing bootstrap/revision mechanism.
- Payment remains pay-on-receipt. No online payment or external delivery service
  is added. Exact Figma matching is still subject to the source/access limits above.

Validation used another isolated SQLite database on port 3101. The browser flow
covered guest configuration, login back to the cart, valid/invalid coupons, loyalty
points, delivery pricing, scheduled pickup, order submission, confirmation,
tracking refresh, and reorder. Server data was checked against browser choices:
two items at 130,000 toman each, 52,000 coupon discount, and 10,000 loyalty discount
produced a 198,000 toman pickup order; delivery would add 20,000 toman.

Mobile widths of 320 and 393 px and dark mode were checked, including purchase-bar
placement above navigation. The nine existing commerce unit tests, TypeScript,
and production build passed. All synthetic records stayed outside the normal
application database.

## Stage four: maps, address positions, and reservations

- Leaflet is loaded in the browser only. The shared map uses OpenStreetMap tiles,
  visible attribution, and normal browser caching. It does not prefetch tiles.
  Internet access is required; tile failures have a visible retry control.
- The cafe map responds to the existing search and filters. Only finite, valid,
  recorded coordinates produce markers. Selecting a marker or its accessible
  list card exposes the cafe and booking links. Missing coordinates are counted
  explicitly; an Iran overview is a generic viewport, never a business location.
- Address editing and the cafe owner's editor share the position picker: click,
  drag, or use keyboard panning followed by the select-center button. Clearing a
  position is supported. Existing user-triggered geolocation remains optional.
  Text addresses must still be entered separately; there is no geocoder.
- Reservations now use the real Persian monthly calendar in a mobile sheet,
  actual availability, a cafe map, and a summary. Unavailable cafes cannot be
  selected. Login preserves the cafe, date, time, and party size. The optional
  request note is not preserved across login. Submissions remain idempotent and
  require actual remaining capacity; cafe approval is still a separate step.
- Reservation history has explicit selected tabs and a refresh control for
  owner status changes. Cancellation uses the existing confirmation and API.

Validation used an isolated SQLite database and server on port 3101. Browser
checks covered marker/card selection, selecting a date outside the week strip,
month navigation, disabled past dates, login return with choices intact, booking,
owner confirmation, refreshing status, cancellation/history, and restored capacity.
Address center selection, dragging, clicking, saving, reopening, and editing were
checked against persisted coordinates. Cafe editor coordinates were also verified
against server data. No browser geolocation permission was requested during tests.
Both themes and 320/393 px mobile widths were inspected, along with desktop.
TypeScript, production build, and all nine existing unit tests passed.

Context7 was unavailable in this session. Map setup followed the official
[Leaflet quick start](https://leafletjs.com/examples/quick-start/) and
[OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).
Public OSM tiles provide no availability guarantee; production traffic should use
a suitable provider before launch. Exact Figma parity remains subject to the
previously documented access limits.

The stage-four audit reported a critical advisory against Next.js 16.3.8.
Stage five upgraded it to 16.4.3 and the new audit reported zero vulnerabilities.
See [the preparation report](release-readiness.md) for current validation and limits.
