# Admin Refunds Design

## Goal

Let the admin issue full or partial refunds (to the customer's original payment method, via Stripe) from `/admin`, without exceeding the Vercel Hobby plan's 12-function limit.

## Constraint

All 12 `api/*` serverless function slots are in use. No new file may be added; this feature is folded into an existing file.

## Backend: extend `api/admin/coupon.js`

No new file is created. A `resource` query param dispatches between coupon logic (unchanged) and the new order/refund logic, mirroring the existing `resource=addresses` convention in `api/user/orders.js`.

- `GET /api/admin/coupon` (no `resource`) — existing coupon list/create/deactivate behavior, unchanged.
- `GET /api/admin/coupon?resource=orders&email=<email>&password=<pw>` — looks up the customer's orders via `order_links` (same join pattern as `api/user/orders.js`), retrieves each Stripe Checkout Session, and expands `payment_intent.latest_charge` to read `amount_refunded` / `refunded` directly from Stripe. Returns each order with a computed status: `none` / `partial ($X)` / `full`.
- `POST /api/admin/coupon?resource=refund` body `{ password, session_id, amount? }` — retrieves the session's `payment_intent`, calls `stripe.refunds.create({ payment_intent, amount? })`. Omitting `amount` issues a full refund; passing `amount` (dollars, converted to cents same as the existing coupon `amount_off` conversion) issues a partial refund. Stripe enforces refund limits itself; any Stripe error is caught and returned as `400 { error: err.message }`.

Auth: same `password === process.env.ADMIN_PASSWORD` check used by every other `api/admin/*` endpoint.

### Refund confirmation email

On successful refund, send a confirmation email to the customer via the existing Resend integration, in the same fire-and-forget try/catch style as the order confirmation email in `api/webhook.js` (email failure does not fail the refund response, since the refund already succeeded in Stripe by that point).

**The refund email is in English** (unlike the Chinese order-confirmation email in `webhook.js` — explicit user instruction, not following that template's language). Content: refund amount, currency, and order/session id.

## Frontend: `admin.html` — new "退款管理" (Refunds) section

Same visual pattern as the existing 发货通知 / 优惠券管理 sections (heading + dedicated password field + form):

```
退款管理
[管理员密码________]
[客户邮箱__________] [查询订单]

查询结果(每笔订单一行):
  2026-06-20  $126.00  未退款        ○全额 ○部分[___] [退款]
  2026-06-15  $89.00   已全额退款    (退款按钮隐藏)
  2026-06-10  $200.00  部分退款$50   ○全额 ○部分[___] [退款]
```

- The amount input only appears when "部分" (partial) is selected.
- Clicking "退款" triggers a `confirm()` dialog before the request fires — this is an irreversible money-moving action, unlike the other buttons in admin.html, so it gets the extra confirmation step.
- On success, only that order row's status is refreshed in place — no full re-query of the email is needed.

## Error handling

- Wrong/missing password → `401`
- Missing `email` (orders lookup) or `session_id` (refund) → `400`
- Stripe refund errors (over-refund, already fully refunded, invalid payment_intent, etc.) → caught, surfaced as `400 { error: err.message }`, shown directly to the admin in the UI
- Refund-email send failure → logged to console only, does not affect the refund response

## Testing

Extend the existing `api/__tests__/admin/coupon.test.js` using the project's existing Jest setup and `__mocks__/stripe.js` / `__mocks__/resend.js` mocks — no new test infrastructure needed. Cases to cover: full refund, partial refund, over-refund error surfaced, orders lookup returns correct refund status for none/partial/full, wrong password rejected on both new resource paths.
