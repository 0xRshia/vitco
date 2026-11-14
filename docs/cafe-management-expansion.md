# Café discovery, management, and reservation expansion

## Requirements and decisions

The customer request covers nine related changes to the existing application:

1. Share the menu categories نوشیدنی گرم، نوشیدنی سرد، قهوه، غذا، پیتزا، برگر، ساندویچ across menu and café discovery. Preserve existing custom categories and normalize known spelling variants.
2. Keep category filters available when choosing a location and combine them with the existing café amenity filters.
3. Add owner CRM with customer names and their latest non-cancelled order, plus first-order customer counts in a chosen date range.
4. Add date-filtered order counts, completed-order revenue, best-selling items, comparison with the preceding equally long period, and item purchase counts by customer.
5. Preview and apply category-wide percentage or fixed base-price adjustments atomically. Tax/inflation describe the owner's reason for the adjustment; they do not create a separate tax invoice calculation.
6. Preserve individual product price editing.
7. Make menu/category editing and event creation directly available from café management.
8. Give each café two prominent paths: reservations/orders and events. Filter events by all, upcoming, and ongoing, using explicit event end times rather than assuming a duration.
9. Show café photos, readable filters, menu/reservation choices, real table selection, and an itemized bottom summary with checkout.

The user confirmed that an introduced customer means a customer's first non-cancelled Vitco order **at that café**. No outside purchase or referral history exists. Reports must state this definition.

The user will supply an online payment provider later. The implemented flow therefore uses the existing payment-at-café/on-delivery behavior and must not claim to charge a card.

## Implementation plan

- Reuse the existing SQLite data, authorization, API validation, Persian inputs, cart, and UI primitives.
- Add backward-compatible database migrations for café tables/gallery images, event end times, reservation table snapshots, and linked dine-in orders.
- Scope reports and bulk changes to the authenticated owner's cafés. Use inclusive Tehran calendar dates and server-side price calculation.
- Submit a reservation and its optional menu preorder in one transaction. Recheck table/café capacity, product availability, prices, and duplicate submission keys on the server.
- Keep old cafés without configured tables usable through the existing capacity reservation flow. Explain that specific tables require owner configuration.
- Validate domain logic, authorization and transactional failures, then build and exercise desktop/mobile customer and owner flows with isolated test databases.

## Integration boundaries

No external service credentials, payment provider, production deployment, remote Git mutations, or fabricated business activity are part of this change. Development and tests use separate databases.

## Verification — 2026-11-14

- TypeScript validation and the production Next.js build passed.
- All 21 unit tests passed, including owner isolation, Tehran date boundaries, historical pricing, stale price previews, table conflicts, atomic preorder rollback, cancellation, and duplicate submission handling.
- All 14 desktop/mobile browser tests passed. The final focused owner/reservation run also passed all four tests after visual refinements.
- Browser coverage includes the seven shared categories and location filters, event phases, CRM and sales reports, manual/bulk prices, gallery uploads, table configuration, and reservation menu selection.
- The reservation browser test deliberately loses a successful server response, then recovers the same booking/order through its original submission key.
- Screenshots were inspected for desktop/mobile event, report, price-preview, and reservation views. Mobile summaries, chart labels, and modal focus were refined during review.
- Repository formatting and whitespace checks passed. No dependency versions, production data, remote Git state, or deployment were changed.
