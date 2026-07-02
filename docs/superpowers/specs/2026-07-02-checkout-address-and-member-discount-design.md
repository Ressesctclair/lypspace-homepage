# Checkout Address Collection, PayPal Order Recording & Member Discount Design

## Goal

Three related gaps in the checkout flow, bundled into one spec because they all touch the same files (`checkout.html`, `api/checkout.js`, `api/webhook.js`):

1. **No shipping address is collected at all**, on either payment path (Stripe or PayPal), so orders can't currently be fulfilled without the customer separately messaging the seller.
2. **PayPal orders have zero server-side record.** `onApprove` only shows a client-side alert and redirects — nothing is written to Supabase, unlike the Stripe path which gets an `order_links` row via the webhook.
3. **Members should automatically get 5% off (95% price) on every product**, on both payment paths, with a visible on-page hint when it kicks in.

## Context

- Checkout is guest checkout: `checkout.html` only collects an email, no login. `profile.html`'s `addresses` table is a separate "saved address book" tied to `user_id` for logged-in members — it is not wired into checkout at all and can't be reused directly for guest orders.
- Two independent payment paths exist on `checkout.html`: a Stripe Checkout redirect (`startCheckout()` → `POST /api/checkout` → `session.url`), and a client-side PayPal Buttons SDK flow (`createOrder`/`onApprove`) that currently has `shipping_preference: 'NO_SHIPPING'` and never calls any backend.
- `api/admin/coupon.js` is gaining a `GET ?resource=orders&email=` endpoint on the sibling `worktree-admin-refunds` branch (see `docs/superpowers/specs/2026-07-02-admin-refunds-design.md`), which lists a customer's orders for the admin refund panel. This branch (`worktree-address-collection`) is based on top of `worktree-admin-refunds` specifically so the address fields added here can be displayed in that same panel without a merge conflict.

## Global Constraints

- No new Supabase table — the existing `order_links` table is extended with new columns.
- No new `api/*` file — all backend logic goes into the existing `api/checkout.js` (new `action` values) and `api/webhook.js` (existing Stripe webhook handler, extended).
- The 5% member discount is a hardcoded constant (`percent_off: 5`), not admin-configurable — nothing in this request asks for a settings UI.
- Member discount and a customer-entered promotion code are mutually exclusive: if a valid promotion code is applied, it wins and the member discount is not applied, regardless of membership status.
- The server never trusts a client-supplied "is this customer a member" flag for pricing — `api/checkout.js` always re-looks-up `users.is_member` by the submitted email at the point a Stripe session or a PayPal order record is created.
- Address fields are not validated for realism (no postal-code-format checking per country) — only "is it filled in."

## Data Model: `order_links` table changes

New nullable columns:
- `shipping_name`, `shipping_street`, `shipping_city`, `shipping_state`, `shipping_postal_code`, `shipping_country`, `shipping_phone`
- `payment_provider` (`'stripe'` | `'paypal'`)
- `paypal_order_id` (nullable)

`stripe_session_id` becomes nullable (a PayPal-paid row will have `paypal_order_id` set and `stripe_session_id` null instead). Exactly one of `stripe_session_id` / `paypal_order_id` is set per row, distinguished by `payment_provider`.

## `checkout.html` changes

- New address form between the email field and the payment buttons: name, street, city, state, postal code, country (full country/region dropdown, not limited to the carriers currently in `CARRIER_LINKS`), phone. Required before either payment path can proceed; no format validation beyond non-empty.
- On email field blur, call `POST /api/checkout` with `{ action: 'check-member', email }`. If `is_member` is true and no promotion code is currently applied, show `✓ Member discount applied — 5% off` in the existing `discount-msg` element and set a client-side `activeDiscount = 'member'` flag.
- The existing `applyCode()` flow (promotion codes) takes priority: a successful `applyCode()` call overwrites `discount-msg` with the coupon's own message and sets `activeDiscount = 'coupon'`. If the email is re-checked afterward and comes back as a member, the coupon message is left alone (coupon already showing wins the display, matching "promo code wins" from the constraints).
- `startCheckout()` (Stripe path): unchanged shape of its request, except it always sends whatever `email` and `promotion_code_id` are currently set — the server decides whether to add the member discount (see below), the client does not send an `is_member` flag.
- PayPal `createOrder()`: `getPayPalAmount()` multiplies the computed total by `0.95` when `activeDiscount === 'member'`. When `activeDiscount === 'coupon'`, PayPal amount logic is unchanged (this project's PayPal flow does not currently support coupon codes at all — out of scope to add that now, matches existing behavior).
- PayPal `onApprove()`: after `actions.order.capture()` succeeds, call `POST /api/checkout` with `{ action: 'record-paypal-order', email, paypal_order_id: details.id, amount: <captured total>, address fields }` before showing the success alert. If this call fails, still show the success alert to the customer (the PayPal payment already happened and can't be undone from here) but log a console error client-side; the server-side handler also logs a "MANUAL RECOVERY NEEDED" error mirroring the existing pattern in `api/webhook.js`'s `order_links` upsert failure handling.

## `api/checkout.js` changes

- New `action: 'check-member'`: takes `email`, looks up `users.is_member` by email (no auth required — this is a public-facing checkout endpoint, matching the pattern of the existing public `action: 'validate'` coupon-check), returns `{ is_member: boolean }`. Email not found → `is_member: false`, not an error.
- New `action: 'record-paypal-order'`: takes `email`, `paypal_order_id`, `amount`, and the address fields. Writes one row to `order_links` with `payment_provider: 'paypal'`, `paypal_order_id`, `customer_email: email`, and the shipping fields. Missing required fields → `400`. Supabase write failure → still return success to the caller (matching the "PayPal money already moved, can't undo" reasoning above) but `console.error` loudly for manual reconciliation.
- Main session-creation flow (shared by the `price_id` / `items` / `amount+product_name` line-item paths): before building `params`, re-look-up `users.is_member` by `email` server-side. If `is_member` and no `promotion_code_id` is present in the request, resolve the fixed member-discount coupon (see below) and add `discounts: [{ coupon: memberCouponId }]` to `params`. If `promotion_code_id` is present, skip the member discount entirely — the two are never combined.
- Member discount coupon resolution: `stripe.coupons.retrieve('member-5pct-off')`; if that throws (coupon does not exist), `stripe.coupons.create({ id: 'member-5pct-off', percent_off: 5, duration: 'once' })` and use the newly created coupon. This makes the feature self-provisioning — no manual one-time Stripe Dashboard setup step required.
- The address fields submitted alongside a Stripe checkout request are placed into `session.metadata` as their own keys (not nested JSON, to keep `webhook.js` parsing trivial): `metadata.shipping_name`, `metadata.shipping_street`, `metadata.shipping_city`, `metadata.shipping_state`, `metadata.shipping_postal_code`, `metadata.shipping_country`, `metadata.shipping_phone`.

## `api/webhook.js` changes

In the `checkout.session.completed` handler, when upserting into `order_links`, also read the `shipping_*` keys off `session.metadata` (each may be `undefined` if, for some reason, a session was created without them — write `null` in that case) and include them in the upsert payload, along with `payment_provider: 'stripe'`.

## Admin display (sibling branch integration)

The `GET /api/admin/coupon?resource=orders` handler being built on `worktree-admin-refunds` selects `stripe_session_id` from `order_links`; this branch's job is only to make sure that once merged, that select also includes the new `shipping_*` columns and `payment_provider`/`paypal_order_id`, and the admin refund panel's per-order row in `admin.html` prints the address as plain read-only text under the existing date/amount/status line. Because that endpoint and panel don't exist yet on `main`, the concrete edit happens when this branch is rebased onto (or merged after) the refund branch — this spec records the requirement so the implementation plan can sequence it correctly, but the actual diff to `api/admin/coupon.js`'s orders handler and `admin.html`'s refund section will be written against whatever Task 1 of the refund plan lands as.

## Error Handling

- `check-member` missing `email` → `400 { error: 'email required' }`
- `record-paypal-order` missing required fields → `400`; Supabase write failure → `200` success response to caller + `console.error` server-side (see above)
- Member coupon retrieve/create: any error other than "not found" during `retrieve` propagates as a normal `500`/`400` the same way other Stripe errors in this file already do
- Address form on `checkout.html`: client-side non-empty validation only, blocking the payment buttons via `alert()` matching the existing `co_email_req` pattern

## Testing

- `api/__tests__/checkout.test.js`: add cases for `check-member` (member / non-member / not-found-email), member discount coupon applied when `is_member` and no promo code, member discount skipped when a `promotion_code_id` is present, `record-paypal-order` success and validation-failure cases, and the member-coupon retrieve-then-create-on-missing flow.
- `api/__tests__/webhook.test.js`: add a case asserting `shipping_*` metadata fields are written into the `order_links` upsert payload.
- `checkout.html`'s new form, the email-blur membership check, and the PayPal amount adjustment are verified manually (no frontend test runner in this project), same as the refund UI in the sibling plan.
