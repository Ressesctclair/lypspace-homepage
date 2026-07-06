# Product Discount (Sale Price) Design

**Goal:** Let the admin set a discounted "sale price" per product from `admin-products.html`, alongside the existing price field. When set, the storefront shows the original price struck through, the computed discount percentage, and the sale price — and checkout charges the sale price. A product-level discount must never stack with a customer promo code or the 5% member discount.

**Context:** Products come from two sources today: static `products.json` (catalog products, overridable per-handle via the `product_overrides` Supabase table) and the `custom_products` Supabase table (admin-created products). `admin-products.html` already has one shared editor modal for both, with a "Price (USD)" field that saves via `POST /api/checkout` (`action: 'product-update'` for overrides, `action: 'create-product'` for custom products). No new API file is needed or allowed — the project is at Vercel Hobby's 12-function limit, so this extends `api/checkout.js`.

**Out of scope:** `rip-curl-bikini.html` and `test-product.html` are standalone static pages with hardcoded prices and fixed Stripe Price IDs — they don't go through `products.json`/`product_overrides`/`custom_products` and are not touched by this design.

## Data model

Add one nullable numeric column to each table:
- `product_overrides.sale_price`
- `custom_products.sale_price`

Semantics: a product is "on sale" when `sale_price` is set and `0 < sale_price < price`. Discount percentage is always derived at read time — `round((1 - sale_price/price) * 100)` — never stored. Clearing `sale_price` (empty string → `null`) removes the discount and the product reverts to showing/charging `price`.

Migration is a manual Supabase SQL statement (run by the user, not part of app code):
```sql
alter table product_overrides add column sale_price numeric;
alter table custom_products add column sale_price numeric;
```

## Backend (`api/checkout.js`)

**`action: 'product-update'`** (line ~128): accept optional `sale_price` in the body. Same pattern as `price`: `if (sale_price !== undefined) update.sale_price = sale_price === '' ? null : parseFloat(sale_price);`

**`action: 'create-product'`** (line ~143): accept optional `sale_price`, store `parseFloat(sale_price) || null` (or omit column when not provided — a plain product with no discount).

**`action: 'inventory'` and `action: 'products'` (GET)**: no change needed — both already `select('*')`, so `sale_price` is included in the response automatically once the column exists.

**Checkout session creation (no-stacking enforcement, line ~280-350):** Accept an optional `handles` array (or reuse per-item `handle` on each `items[]` entry) describing which product(s) are being purchased. Before applying `promotion_code_id` or the member coupon:
1. Look up `product_overrides` (by handle) and `custom_products` (by handle) for the given handle(s).
2. If any matched row has an active `sale_price`, skip the `params.discounts` assignment entirely — ignore `promotion_code_id` and skip the member-coupon lookup, regardless of what the client sent.

This is the server-side source of truth; the frontend check (below) exists only to give the customer an honest UI, not to be the enforcement point.

## Admin UI (`admin-products.html`)

Below the existing "Price (USD)" field (line ~148), add:

```html
<div class="field">
  <label>Sale Price (USD, optional)</label>
  <div style="display:flex;gap:8px;align-items:center">
    <input type="number" id="ed-sale-price" step="0.01" min="0" placeholder="Leave blank for no discount" oninput="updateDiscountPreview()">
    <span id="discount-pct-preview" style="font-size:12px;color:#1a7f37;white-space:nowrap"></span>
    <button type="button" class="btn outline" onclick="clearDiscount()">Clear Discount</button>
  </div>
</div>
```

- `updateDiscountPreview()`: reads `ed-price` and `ed-sale-price`, shows `"30% OFF"` next to the input when sale price is a positive number less than price; shows nothing otherwise (including when sale price ≥ price — treat as invalid/no discount rather than a "negative discount").
- `clearDiscount()`: empties `ed-sale-price` and re-runs the preview.
- `openEditOverride()` / `openEditCustom()` (lines ~332, ~367): populate `ed-sale-price` from `ov.sale_price` / `p.sale_price` when present.
- `openCreate()` (line ~307): reset `ed-sale-price` to empty.
- `saveProduct()` (line ~473): include `sale_price: document.getElementById('ed-sale-price').value` in both the `product-update` and `create-product` request bodies.

## Storefront display

**`catalog.html`** (price rendering ~line 251-260): when the product is on sale, render:
```html
<p class="product-price"><s class="price-original">$126.00</s> <span class="price-discount-pct">30% OFF</span> <span class="price-sale">$88.20</span></p>
```
instead of the current plain `<p class="product-price">$126.00</p>`. Sold-out still wins visually (existing `<s>` wrap for sold-out stays; a sold-out + on-sale product just shows the sale price struck through, no discount badge, since it can't be bought either way).

**`product.html`** (price rendering ~line 243, 303, 485): same three-part format in `#price-display`. `currentPrice()` (line ~227) must return the sale price (if active) instead of `product.price`/variant price when the shopper is buying, since this value feeds `addToCart()` and `buyNow()` directly.

**Variant price scaling:** ~3% of catalog variants have a per-variant price that differs from the product's base price. When a discount is active, apply the *same discount percentage* to each variant's own price rather than substituting a single flat sale price, preserving relative differences between variants (e.g. a variant priced higher than the base still ends up proportionally higher after discount).

## Checkout (`checkout.html`, `cart.js`, `product.html`)

**Charging the discounted amount:** `product.html`'s `buyNow()` (line ~542) and `addToCart()` (line ~511) already compute the amount to send to checkout via `currentPrice()` — once that function returns the sale price when active, no further change is needed to the charge amount itself.

**Passing `handle` through to checkout, so `checkout.html` can detect an active discount:**
- `product.html` `buyNow()`: append `&handle=${product.handle}` to the `/checkout` URL.
- `cart.js` (line ~290): add `handle: item.handle` to the object pushed into stored cart items. This is additive only — it does not touch the Stripe Express init timing or the in-app-browser banner logic, both of which stay untouched.

**`checkout.html` UI enforcement:**
- On load, resolve the handle(s) for the current purchase (`?handle=` query param for buy-now, or each `Cart.getItems()` entry's `.handle` for cart checkout).
- Fetch `/api/checkout?action=inventory` (existing, public endpoint) and check whether any relevant handle has an active `sale_price`.
- If so: disable the coupon `<input>` and "Apply" button with a short note (e.g. "Discount pricing — coupon codes and member discount don't apply to sale items"), and skip the automatic member-discount check-and-apply that currently runs on page load.
- If a cart contains a mix of sale and non-sale items, the same restriction applies to the whole order (no partial application) — simplest rule, matches "must never stack" requirement without needing per-item discount math in Stripe's `discounts` param (which is order-level, not per-line-item, anyway).

**PayPal path:** `getPayPalAmount()` in `checkout.html` only applies a discount when `activeDiscount` is `'coupon'` or `'member'`. Since the UI enforcement above prevents `activeDiscount` from ever being set on a sale order, PayPal naturally never stacks either — no separate PayPal-side change needed. This relies on the same pre-existing, known client-trust limitation already documented for PayPal (amounts are client-computed, not server-re-verified) — not a new gap introduced by this design.

**Not in scope:** the pre-existing pattern where `api/checkout.js` trusts a client-supplied `amount`/`price_data.amount` for line items without a Stripe Price ID (used by every catalog/custom product today, sale or not). This design doesn't change or worsen that trust model — it only adds `sale_price` as another value flowing through the same existing path.

## Testing

No frontend test runner exists in this project (pre-existing, unchanged). Add Jest coverage in `api/__tests__/checkout.test.js` for the new backend behavior:
- `product-update` with `sale_price` persists correctly; `sale_price: ''` clears it to `null`.
- `create-product` with `sale_price` persists correctly.
- Checkout session creation: given a handle with an active `sale_price`, a request that also includes `promotion_code_id` does **not** get `params.discounts` set (server-side no-stacking enforcement) — this is the one behavior worth a real regression test since it's a business-logic invariant, not just plumbing.

Manual verification checklist:
- Set a sale price in `admin-products.html`, confirm the live "% OFF" preview and that "Clear Discount" removes it.
- Confirm `catalog.html` and `product.html` show original price struck through + percentage + sale price.
- Confirm a variant-priced product scales each variant's price by the same percentage.
- Buy a sale item: confirm the Stripe charge amount matches the sale price, and the coupon field is disabled with no member discount applied.
- Confirm a non-sale item still allows coupon codes and member discount as before (regression check).
