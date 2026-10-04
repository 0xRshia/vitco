# Design coverage

Source: `/Users/admin/Downloads/Vitco.fig`, inspected locally as a ZIP/fig-kiwi
archive. The archive contains 12,338 nodes, editable UI-kit sections, and embedded
light/dark screen previews. Representative screen previews were inspected for
layout and interaction intent. The local archive does not supply a usable cloud
Figma file key, so cloud `get_design_context` could not be used.

The reference is a 393 px mobile app. The implementation mirrors its rounded
surfaces, separated option rows, peach accents, quantity controls, card hierarchy,
segmented delivery/pickup control, bottom navigation, dialogs, and connected flows
in RTL. Desktop adds a navigation rail and wider layouts. Vitrin Cafe's public
brand illustrations replace the reference's checkerboard image areas only in
editorial brand sections; absent business photos remain explicitly absent.

| Figma section / representative light frame       | Implemented route / state                                                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Home — `1:69384`, `1:69595`, `1:69802`           | `/`; guest/member home, real loyalty balance and most recent order                                                                       |
| Splash — `1:71599`                               | Branded app shell and loading state; no blocking timed splash                                                                            |
| Login cases — `1:69880`–`1:71682`                | `/login`, `/register`, `/verify`, `/forgot-password`, `/reset-password`; validation, visibility toggles, disabled unconfigured providers |
| Delivery menu — `1:71872`, `1:72055`             | `/menu?mode=delivery`; category, café, and text filters                                                                                  |
| Store pickup — `1:72245`, `1:72425`              | `/menu?mode=pickup`; persistent delivery/pickup switch                                                                                   |
| Address selection — `1:72525`–`1:72951`          | `/addresses`; list, create/edit, real geolocation/map link, default address, deletion confirmation                                       |
| Store selection — `1:73153`–`1:73700`            | `/cafes`; search/filter, favorites, empty results, listing/map controls                                                                  |
| Product detail — `1:73856`–`1:74181`             | `/products/:id`; image state, sizes, maximum addons, note, quantity, add confirmation, cart replacement confirmation                     |
| Cart delivery — `1:74343`–`1:75306`              | `/cart`; delivery address, quantity/removal, coupon application/errors, points, live quote, payment method                               |
| Order success — `1:75365`                        | `/orders/:id?success=1`; server-persisted order confirmation                                                                             |
| Cart pickup — `1:75537`–`1:76715`                | `/cart`; pickup mode, Persian scheduled pickup selector, coupon/points/removal states                                                    |
| Stores — `1:76972`–`1:77593`                     | `/cafes`, `/cafes/:id`; café detail, amenities, sourced data status, menu/reviews/events tabs                                            |
| Delivery orders — `1:77670`–`1:78945`            | `/orders`, `/orders/:id`; current/history, pending/preparing/delivering/completed/cancelled, receipt, support                            |
| Pickup orders — `1:79022`–`1:80274`              | `/orders`, `/orders/:id`; mode filters, pending/preparing/ready/completed/cancelled                                                      |
| Profile — `1:80404`–`1:80583`                    | `/profile`, `/settings`, `/payment`, `/rewards`; profile/avatar, password, theme, pay-on-receipt information                             |
| Reservation online — `1:80738`–`1:81687`         | `/reserve`; café selection, Persian date/week/month controls, real hourly availability, party size, notes, request confirmation          |
| My reservation — `1:81818`, `1:81867`, `1:82005` | `/reservations`; pending/confirmed/completed/cancelled, future/history, empty states and cancellation                                    |
| Dark variants — `1:82043`–`1:95267`              | Every route supports the persisted dark theme; states share the same implementation                                                      |

Additional Vitrin Cafe concept views: `/events`, `/events/:id`, `/favorites`,
`/notifications`, `/support`, `/scan`, `/about`, `/contact`, `/privacy`, `/terms`.
The `/dashboard` owner workspace makes ordering, reservations, events, and coupons
operable using actual user-entered data.

## Deliberate adaptations

- All UI copy is Persian; original English names and dollar prices are not seeded.
- Published source prices are preserved in toman and attributed to their source.
- US maps and sample addresses are replaced with actual user geolocation/coordinates
  and map links. No fabricated nearby locations or distances are shown.
- Loyalty level/progress claims and promotional percentages appear only when backed
  by actual account/coupon data. There are no fabricated promotions.
- Apple Pay/card charging is replaced by explicit pay-on-receipt behavior; no payment
  provider was selected or configured. The payment view remains available.
- Order/booking success is based on a database write, and fulfillment/confirmation
  status is changed by the owning café. There are no simulated timers or deliveries.
- Unconfigured SMS/email services have clear unavailable states, never fake codes.
- Main shell loading replaces the purely decorative splash screen, avoiding a delay
  on every navigation.

## Brand asset provenance

All are local WebP files used as editorial illustrations:

- `public/images/hero.webp`: `https://vitrincafe.ir/assets/images/home/hero.webp`
- `public/images/discover.webp`: `https://vitrincafe.ir/assets/images/home/features/view.webp`
- `public/images/cup.webp`: `https://vitrincafe.ir/assets/images/home/register-cta/cup.webp`
- `public/images/coop.webp`: `https://vitrincafe.ir/assets/images/home/coop.webp`

Vazirmatn is bundled from `@fontsource/vazirmatn`. Product and café photos are
supplied only through real owner uploads. No image generation or third-party stock
photography was used.
