# Zarinpal payments

## Current activation status

The gateway integration is optional and remains unavailable while its configuration
is incomplete or its callback origin is local. No external sandbox or live
transaction has been performed as part of this implementation.

The preview deployment target is `vitco.hmghadam.com` on the user's existing VPS.
Keep **all three `ZARINPAL_*` variables empty on the preview server** so it remains
an offline-payment preview. Do not copy the development secret file into a
release or CI artifact. A public HTTPS preview origin alone does not make a
merchant terminal valid for that domain.

The future primary domain is `vitco.ir`; the user has not purchased it yet. Do not
use it as the live callback origin until ownership, deployment, HTTPS, and terminal
registration are complete. The existing terminal domain was reported as
`vitrincafe.ir`; it must be updated to the actual live domain. Confirm the server
IP in the terminal settings before activation. A readiness pass cannot confirm
any of these external conditions.

The requested café scope is all managed cafés (`*`). Every payment uses the one
configured merchant account. This is **not** automatic split settlement, an escrow
system, or separate payouts to café owners. Imported browse-only listings still
cannot receive orders.

## Configuration

Keep credentials in the deployment secret store or ignored `.env.local`; never
copy the real merchant ID into tracked files, screenshots, logs, or documentation.
Use the complete 36-character merchant UUID supplied by the account owner. A
truncated screenshot is insufficient and must not be completed by guessing.

| Variable               | Required value                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ZARINPAL_MERCHANT_ID` | Complete merchant UUID.                                                                                           |
| `ZARINPAL_ENV`         | Explicitly `live` or `sandbox`; no automatic default.                                                             |
| `ZARINPAL_CAFE_IDS`    | `*`, or unique café IDs separated by commas with no spaces or empty entries.                                      |
| `APP_ORIGIN`           | Explicit canonical origin without a path, query, credentials, or trailing slash. Live mode requires public HTTPS. |

Leaving all three `ZARINPAL_*` variables empty keeps online payment disabled.
Partial, padded, or invalid values fail the configuration readiness check and do
not enable online payment. Existing café/on-delivery payment remains available.

Sandbox must be selected explicitly. It is a testing environment without a real
charge, not evidence that the live merchant, domain, callback, or settlement works.
Its API host is `sandbox.zarinpal.com`; live uses `payment.zarinpal.com`.
[Official sandbox guide](https://www.zarinpal.com/docs/paymentGateway/sandBox).

## Provider contract

The live request endpoint is
`https://payment.zarinpal.com/pg/v4/payment/request.json`; verification uses
`https://payment.zarinpal.com/pg/v4/payment/verify.json`. Both accept JSON POSTs.
The returned authority identifies the redirect at
`https://payment.zarinpal.com/pg/StartPay/{authority}`. Callback `Status=NOK`
denotes failure or cancellation. `Status=OK` still requires server verification.
Verification code `100` succeeds; `101` means it was already verified and must be
handled without a second fulfillment.
[Official connection guide](https://www.zarinpal.com/docs/paymentGateway/connectToGateway).

Application prices are integer **toman**. The server converts the saved quote to
**IRR** exactly once (`amountRial = totalToman * 10`), requires a positive safe
integer within the provider limit, explicitly sends `currency: "IRR"`, and verifies
the same saved amount. Never accept a callback or browser amount as authoritative.
[Official currency guide](https://www.zarinpal.com/docs/paymentGateway/moreFeatures/currency).

Provider errors include amount mismatch (`-50`), merchant mismatch (`-53`), invalid
authority (`-54`), and rate limits (`-12`). An ambiguous network response is not a
successful payment. It must remain retryable or awaiting reconciliation rather
than silently becoming an offline or paid order.
[Official error list](https://www.zarinpal.com/docs/paymentGateway/errorList).

## Application endpoints

| Endpoint                               | Access and behavior                                                                                                                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/payments` with `order_id`   | The signed-in buyer starts or resumes payment for their pending online order.                                                                                                                                        |
| `GET /api/payments/callback`           | The provider returns the saved payment ID, random state, authority, and status. The server checks the saved state hash and authority before resolving the payment, then redirects to that order at the saved origin. |
| `POST /api/payments/{order_id}/verify` | The buyer or café owner requests reconciliation. Provider inquiry is advisory; successful payment still passes verification with the saved amount.                                                                   |

Order payment state is `unpaid`, `pending`, `paid`, `failed`, or
`refund_required`. Gateway-attempt state is stored separately, including uncertain
responses. A confirmed payment received after cancellation, reservation expiry,
or an earlier successful payment requires reconciliation rather than fulfillment.
Callbacks do not establish a browser session or grant access to another buyer's
order.

## Retries and reconciliation

The request documentation does not define a payment-request idempotency key.
Application-side submission keys and stored payment attempts therefore need to
control duplicate clicks, redirects, callbacks, and concurrent verification.
Do not blindly create a second request after a request timeout; the first request
may already have reached the provider.

An authority and its saved merchant/environment/amount must remain bound to the
same local attempt. Verification retries can return `101`; local database state
must ensure order creation, coupon/points effects, reservation linking, and
notifications are applied once. A late or repeated callback cannot override an
already settled local result based only on its query parameters.

The inquiry endpoint reports payment state but is explicitly not a verification
endpoint. A `PAID` or `VERIFIED` inquiry response still needs the application's
normal verification/reconciliation path with the stored amount.
[Official inquiry guide](https://www.zarinpal.com/docs/paymentGateway/otherMethods/Inquiry).

The provider's `unVerified` method lists at most 100 successful unverified
transactions. It can support operator reconciliation; this readiness check does
not call it or any other provider method.
[Official unverified-payment guide](https://www.zarinpal.com/docs/paymentGateway/otherMethods/unVerified).

The application explicitly sends `metadata.auto_verify: false` so final
verification remains server controlled. This overrides the terminal's automatic
verification setting. A lost callback still needs timely reconciliation; do not
assume an undocumented timeout for automatic return of funds.
[Official verification settings](https://www.zarinpal.com/docs/paymentGateway/moreFeatures/session-validation).

## Cancellations, refunds, and settlement

Cancelling an application order is not proof that money was refunded. The gateway
reverse method applies only to successful transactions within 30 minutes and
requires the terminal server IP to be configured. It is not a general refund API.
This integration does not automatically invoke reverse, issue refunds, split
settlement, or transfer café payouts. Resolve paid-order cancellation and payment
mismatches through the merchant's verified operational process; do not mark funds
returned without provider evidence.
[Official reversal guide](https://www.zarinpal.com/docs/paymentGateway/moreFeatures/reverse).

## Local verification

```sh
npm run check:readiness
npm run check:readiness -- --production
```

The readiness script validates configuration only. It prints no credential values,
does not resolve domains, does not contact Zarinpal, and does not create, verify,
cancel, reverse, refund, or transfer money. A syntactically valid merchant UUID is
not proof of ownership or activation. Local transport tests do not replace a
separately authorized end-to-end provider test after the real domain is ready.
