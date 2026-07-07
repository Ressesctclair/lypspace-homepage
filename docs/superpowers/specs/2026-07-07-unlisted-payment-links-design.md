# Unlisted Payment Links — Design

## Problem

Two related but distinct needs:

1. An existing custom product should be removable from the public catalog grid/search, while its direct product-page link still works and lets a customer complete payment.
2. The admin wants to hand a specific customer a private, custom-priced payment link (e.g. a negotiated price, a custom/one-off item) that isn't listed anywhere on the site but works indefinitely until manually disabled.

Both only apply to `custom_products` (admin-created products with no `products.json`/Shopify backing) — not to the static catalog import.

## Data model

Add one column:

```sql
alter table custom_products add column unlisted boolean not null default false;
```

`unlisted` is independent of the existing `hidden` state (tracked via `site_settings.hidden_products`, a JSON array of handles):

| Flag | Catalog grid/search | Direct product page + checkout |
|---|---|---|
| `hidden = true` (existing "Draft") | excluded | excluded (only admin, via `pw`, can load it) |
| `unlisted = true` (new) | excluded | **works normally for anyone with the link** |
| neither | included | included |

## Backend changes

- `create-product` action (`api/checkout.js`): accept and persist `unlisted` (boolean, default `false`).
- No changes needed to `action=products`'s hidden-filtering, to `checkout.js`'s order-creation/discount logic, to `product.html`, or to `admin-orders.html` — unlisted products flow through the exact same `custom_products` → checkout → `order_links` pipeline as any other custom product, so member discount / coupon stacking, shipping address collection, and order visibility in `admin-orders.html` all apply unchanged.
- Sold-out edge case: `create-product` currently computes `total_qty` as the sum of variant quantities, defaulting to `0` when no variants are given, which `product.html` treats as sold out. For the quick-link flow (no variants), the backend must instead set `total_qty` to a large sentinel (e.g. `999999`) so the product is never shown as sold out. This only applies when variants are omitted; a normal product with real variant-based stock tracking that later gets marked `unlisted` keeps its real `total_qty`.

## Frontend changes

**`catalog.html`**: filter out `p.unlisted === true` when building `allProducts` (or at render time) — same treatment for the grid and search.

**`admin-products.html`**:
- Product edit panel: add an "Unlisted (not listed, but link still works)" checkbox next to the existing "Hidden (Draft)" checkbox, saved via `create-product`'s `unlisted` field.
- New "Quick payment link" panel: title + price only. On submit: auto-generate a random handle (e.g. `link-<10 hex chars>`), call `create-product` with `unlisted: true` and no variants, then display the resulting URL (`/product.html?h=<handle>`) with a **copy button**.
- Product list rows for any `unlisted` custom product also get a copy-link button.

**`product.html` / `checkout.html`**: no changes — already handle any custom product handle correctly via the existing `action=products` fetch and checkout flow.

## Error handling / edge cases

- Random handle generation retries on collision (extremely unlikely given hex randomness, but `create-product` uses `upsert`, so a collision would silently overwrite — generate with enough entropy, e.g. `crypto.randomBytes(6).toString('hex')`, and treat as effectively non-colliding).
- Price must be a positive number; reuse existing client-side validation patterns from the admin product editor.
- No new API file needed — everything is additive fields/branches within the existing `api/checkout.js`, staying within the 12-function Hobby-plan cap.

## Out of scope

- No changes to static `products.json`/catalog-imported products — unlisting only applies to `custom_products`.
- No token expiry, one-time-use, or per-customer access control — link validity is "works until the admin disables/deletes the product or un-checks Unlisted," per requirements.
- No changes to the existing `hidden` (Draft) mechanism.
