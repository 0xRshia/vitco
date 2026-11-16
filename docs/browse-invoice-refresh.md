# Café discovery and invoice payment refresh

## Research and plan

The November 16 request replaces address delivery, the embedded browse map and
large catalogue tiles. The supplied Snappfood and Foodro screenshots define
compact café/product rows and an in-person invoice flow. The neighboring
Ham-Ghadam `components/evenline/event-map.tsx` and `lib/map-layout.ts` define the
full-screen map, persistent search/filter controls, geolocation and selectable,
resizable result drawer. Reuse that interaction model, the minimal OpenFreeMap
base, Vitco's typography/tokens and real catalogue. A shared MapLibre canvas
replaces Leaflet across browsing, booking previews and the location editor.
Unrelated event APIs and application data are not copied.

Implementation order:

1. Remove address delivery from new customer orders and owner controls. Preserve
   historical orders and saved personal addresses.
2. Open café discovery as a full-screen map. Keep filters, a compact list view,
   coordinate-free entries, permission failures and empty results usable.
3. Replace café and menu tiles with compact rows, real sorting and filtering.
   Retain the existing reservation and product-option workflows.
4. Replace the three home service shortcuts with the invoice payment steps.
5. Add invoice amount → discount review → gateway selection. Store these
   payments distinctly from menu orders, reuse the existing payment ledger and
   server-side Zarinpal verification, and complete invoices only after verified
   payment. Owners configure an automatic in-person percentage; existing café
   coupons can supply a better discount. Never invent cashback or other gateways.
6. Validate arithmetic, authorization, stale totals, idempotency, payment
   callbacks, map selection, filters, mobile layouts and existing reservations.

## Constraints

- Only registered café coordinates produce map markers. Missing coordinates are
  reported and the same cafés remain accessible from the list.
- All amounts in Vitco are integer toman; the existing provider converts to IRR.
- The automatic invoice discount defaults to zero. Coupon and automatic discounts
  do not stack; the larger discount applies. The owner/customer UI states this.
- A quoted total is recalculated before persistence. Invoice creation requires
  a claimed, active café and an available online gateway. Unconfigured gateways
  remain visibly unavailable and never produce a fake payment.
- Existing data, reservations, gateway credentials, deployment infrastructure
  and the neighboring project remain intact.

## Map implementation

- `maplibre-gl` is pinned to 6.18.0. The older renderer in the neighboring
  project has a published attribution sanitizer advisory; use the patched release
  while preserving the same Positron/Dark base and interaction model.
- MapLibre 6 shapes Persian and bidirectional text internally. No deprecated RTL
  plugin or separately downloaded runtime is loaded. `predev` and `prebuild`
  copy the exact locked ESM worker and its license to a versioned public URL;
  Turbopack requires an explicit worker URL. Release packaging verifies the
  worker bytes match the installed dependency before creating an artifact.
- All markers and captions come from real saved coordinates; screen-space groups
  carry the exact café count, separate with zoom and retain co-located cafés in
  the drawer. No synthetic pins, coordinates, ratings, travel times or offers.
- The three map attribution links remain visible above the mobile drawer. Theme
  changes preserve the camera. WebGL or provider failures retain the independent
  list and show an explicit recovery message.
- Context7 was unavailable. The exact installed types and primary documentation
  were checked: [OpenFreeMap quick start](https://openfreemap.org/quick_start/),
  [MapLibre API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/),
  [built-in RTL](https://maplibre.org/maplibre-gl-js/docs/API/functions/setRTLTextPlugin/),
  [6.18.0 release](https://github.com/maplibre/maplibre-gl-js/releases/tag/v6.18.0),
  [security advisory](https://github.com/advisories/GHSA-jrc7-96c5-q579).

## Validation

- 53 unit tests cover existing commerce, invoice arithmetic, stale totals,
  authorization, idempotency, verified settlement, loyalty and real analytics,
  map filtering, distance and clustering.
- Desktop/mobile browser checks cover all public routes, real temporary-database
  customer/owner operations, map selection and drawer controls, filtering, compact
  menu options, invoice amounts/coupons, disabled-gateway behavior, and preserved
  table reservations. The new map checks assert the worker is served successfully.
- Production build, TypeScript, formatting, readiness, diff whitespace and npm
  audit were checked. No new vulnerability is reported by the locked dependencies.
- Real OpenFreeMap tiles and connected Persian labels were separately inspected
  in light/dark mobile views. Portrait and 852×393 landscape checks confirmed no
  drawer/header overlap or horizontal overflow, and no browser errors.
- All write-based verification used isolated temporary SQLite databases. No
  live customer account, café, order, reservation or bank transaction was created.
- Payment activation remains intentionally disabled on the preview domain until
  the existing merchant's domain registration is updated. Missing café
  coordinates remain explicit and do not generate invented map markers.
