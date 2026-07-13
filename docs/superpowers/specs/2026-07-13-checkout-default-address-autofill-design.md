# Checkout Default Address Autofill — Design

## Problem

`profile.html`'s "Address management" page lets logged-in users save shipping addresses (name/street/city/postal_code/country, one optionally marked `is_default`) via the `addresses` table (`api/user/orders.js`, `?resource=addresses`). `checkout.html` never reads from this — every checkout, even for a returning logged-in customer, requires retyping the full shipping address by hand.

## Change

Add a new, self-contained script appended to `checkout.html`'s existing `<script>` block (no existing lines modified). On page load:

1. `fetch('/api/user/orders?resource=addresses', { credentials: 'include' })`.
2. If the response is 401 (guest / not logged in) or the request errors, do nothing — guest checkout is completely unaffected.
3. If `addresses` is an empty array, do nothing.
4. Pick the address to use: the one with `is_default === true`; if none is marked default, fall back to the earliest-saved address. The API returns addresses ordered by `created_at` descending, so "earliest saved" is the **last** element of the array, not the first.
5. Fill the existing checkout inputs from the chosen address: `ship-name`, `ship-street`, `ship-city`, `ship-postal` (`postal_code`), and the `ship-country` `<select>` (match by option text/value against `country`).
6. `ship-state` and `ship-phone` have no equivalent in the saved-address schema — leave them blank for manual entry.
7. Filled fields remain normal, fully editable inputs; nothing is disabled or marked readonly. No UI text or indicator is added — the fill is silent.

## Out of scope

- No changes to `cart.js`, `profile.html`, the `addresses` table schema, or `api/user/orders.js` — this consumes the existing addresses API as-is.
- No `state`/`phone` fields added to the saved-address schema — out of scope per explicit instruction; those two checkout fields stay manual-only.
- No visual "autofilled" indicator or banner.
- No change to guest checkout flow — this only ever activates for an authenticated session with at least one saved address.
