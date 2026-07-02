# PayPal Coupon Discount Design

**Goal:** A member who applies a valid Stripe promotion code and then pays via PayPal currently gets no discount at all (PayPal only honors the 5% member discount, never a coupon). Make the PayPal charge amount honor an applied coupon the same way the Stripe path already does.

**Context:** Follow-up to the checkout-address-and-member-discount plan (merged as PR #1). `checkout.html`'s `activeDiscount` state (`null | 'coupon' | 'member'`, added in that plan) already tracks which discount is active and already enforces mutual exclusivity between a coupon and the member discount. `POST /api/checkout` with `action: 'validate'` (pre-existing) already returns the discount value on success — `{ valid: true, discount: { type: 'percent'|'amount', value, currency? }, promotion_code_id, message }` — but `applyCode()` currently discards the `discount` field, keeping only `promotion_code_id` (Stripe-specific, unusable by PayPal) and the code string.

**Scope:** `checkout.html` only. No backend changes — the data needed already exists in the `validate` response. No changes to `order_links`, no new element IDs, no changes to the Stripe path.

## Changes

**1. Store the discount value.** Add a page-level variable `appliedCouponDiscount = null`. In `applyCode()`'s valid branch, set `appliedCouponDiscount = d.discount`. In the invalid/error branch (and anywhere `appliedCouponCode`/`promoCodeId` are currently cleared), also clear `appliedCouponDiscount = null`.

**2. Apply it in `getPayPalAmount()`.** Replace the current member-only logic:

```js
function getPayPalAmount() {
  const base = isCart ? Cart.total() : parseFloat(params.get('amount') || '0') * qty;
  let discounted = base;
  if (activeDiscount === 'coupon' && appliedCouponDiscount) {
    discounted = appliedCouponDiscount.type === 'percent'
      ? base * (1 - appliedCouponDiscount.value / 100)
      : base - appliedCouponDiscount.value;
  } else if (activeDiscount === 'member') {
    discounted = base * 0.95;
  }
  return Math.max(0, discounted).toFixed(2);
}
```

**Edge case:** a fixed-amount coupon (`type: 'amount'`) larger than the cart total would otherwise produce a negative number. `Math.max(0, discounted)` clamps it to `0.00`. The existing `createOrder` guard (`if (parseFloat(amount) <= 0) return Promise.reject();`) already blocks PayPal from opening a popup for a zero/negative order, so no new guard is needed.

**Not in scope:** currency conversion for `amount`-type coupons in a currency other than USD — the whole checkout flow already hardcodes `currency_code: 'USD'` for PayPal, so this follows existing behavior rather than introducing a new limitation.

## Testing

No frontend test runner exists in this project (pre-existing limitation, unchanged by this design). Verification is manual, added to the existing manual PayPal checklist:
- Apply a percent-off coupon, confirm the PayPal button charges the discounted amount.
- Apply a fixed-amount coupon smaller than the cart total, confirm correct subtraction.
- Apply a fixed-amount coupon larger than the cart total, confirm the PayPal button does not open a popup (amount clamps to 0, `createOrder` rejects).
- Confirm a member email with no coupon still gets the 5% member discount on PayPal (regression check).
- Confirm a member email *and* a valid coupon together apply the coupon discount, not the member discount (mutual exclusivity, already enforced by `activeDiscount`).
