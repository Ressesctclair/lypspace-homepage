# Checkout Default Address Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a logged-in customer with at least one saved address opens `checkout.html`, their shipping fields are pre-filled from their default saved address (or their earliest-saved one, if none is marked default) — so returning customers don't retype their address every time.

**Architecture:** A single new async function, `autofillDefaultAddress()`, is added to `checkout.html`'s existing inline `<script>` block, following the same fire-and-forget init pattern already used by `checkForSaleItems()` in this file (defined, then immediately invoked at top level). It calls the existing `GET /api/user/orders?resource=addresses` endpoint (already built for `profile.html`, unchanged here), picks an address, and fills the existing `ship-*` input values. No other function in the file is touched or depends on it.

**Tech Stack:** Vanilla JS (no framework), same as the rest of `checkout.html`. No backend/API/DB change — this only consumes the existing `addresses` endpoint.

## Global Constraints

- Purely additive: do not modify any existing line in `checkout.html`, and do not touch `cart.js`, `profile.html`, `api/user/orders.js`, or the `addresses` table.
- Guest checkout (no `auth_token` cookie) must be completely unaffected — a 401 or any fetch error is silently swallowed, no error shown to the user.
- No `state` or `phone` autofill — those two checkout fields have no equivalent in the saved-address schema and stay manual-only.
- No UI indicator, banner, or message when autofill happens — it is silent.
- No frontend test runner exists in this project for HTML/inline-script files (confirmed: `package.json`'s jest config is `testEnvironment: "node"` and only `api/**/*.test.js` files exist — `cart.js`/`i18n.js`/`pannable.js` have zero test coverage). Verify manually in a browser via `vercel dev`, consistent with every other `checkout.html` task in this project (see `docs/superpowers/plans/2026-07-02-checkout-address-and-member-discount.md` Task 5, Step 4).

---

### Task 1: `checkout.html` — autofill shipping fields from the logged-in user's default saved address

**Files:**
- Modify: `checkout.html:210-212` (insert new function + call between the existing `saleItemsCheckPromise` line and `checkMembership()`)

**Interfaces:**
- Consumes: `GET /api/user/orders?resource=addresses` (existing, from `api/user/orders.js`), which returns `{ addresses: [{ id, user_id, name, street, city, postal_code, country, is_default, created_at }, ...] }` ordered by `created_at` descending, or 401 if not authenticated.
- Produces: nothing consumed by other tasks — this is the only task in this plan.

- [ ] **Step 1: Add `autofillDefaultAddress()` and invoke it**

Current (`checkout.html:210-212`):

```js
    const saleItemsCheckPromise = checkForSaleItems();

    async function checkMembership() {
```

becomes:

```js
    const saleItemsCheckPromise = checkForSaleItems();

    async function autofillDefaultAddress() {
      try {
        const r = await fetch('/api/user/orders?resource=addresses');
        if (!r.ok) return; // 401 (guest) or any server error — leave the form blank
        const { addresses } = await r.json();
        if (!addresses || !addresses.length) return;
        // API returns addresses newest-first, so the earliest-saved one is the last element.
        const chosen = addresses.find(a => a.is_default) || addresses[addresses.length - 1];
        document.getElementById('ship-name').value = chosen.name || '';
        document.getElementById('ship-street').value = chosen.street || '';
        document.getElementById('ship-city').value = chosen.city || '';
        document.getElementById('ship-postal').value = chosen.postal_code || '';
        if (chosen.country) document.getElementById('ship-country').value = chosen.country;
        // ship-state and ship-phone have no equivalent in the saved-address schema — left for manual entry.
      } catch {
        // best-effort autofill only — any failure just leaves the fields blank for manual entry
      }
    }
    autofillDefaultAddress();

    async function checkMembership() {
```

This placement runs after `countrySelect.innerHTML` is populated (`checkout.html:141-143`), so setting `ship-country`'s `.value` will match an existing `<option>` whenever `chosen.country` is an exact string match; if it isn't (e.g. a value saved before this feature existed, or free-text that doesn't match the fixed country list), the select simply stays on its blank "Select country" default — no error, no crash.

- [ ] **Step 2: Manual verification**

Run `vercel dev` from the current worktree directory, then in a browser:

1. **Guest (no login):** open `http://localhost:3000/checkout?price_id=price_1SfHnN4IZcEaiWjkyJz96vJX&name=Test&qty=1` in a private/incognito window. Confirm all `ship-*` fields stay empty and no error appears in the console beyond the expected 401 network response.
2. **Logged in, one address marked default:** log in as a test user, go to `/profile`, add two addresses (e.g. "Address A" and "Address B"), mark "Address B" as default. Open the same checkout URL. Confirm `Full name`, `Street address`, `City`, `Postal code`, and `Country` are pre-filled with Address B's values, and `State/Province` and `Phone` are empty.
3. **Confirm fields stay editable:** change the pre-filled `City` value by hand. Confirm it accepts the edit normally (no readonly/disabled behavior).
4. **Logged in, no default set:** in `/profile`, unmark Address B as default (or delete it, leaving only Address A un-defaulted). Reload the checkout page. Confirm the fields are filled with Address A's values (the earliest-saved one).
5. **Logged in, no saved addresses:** delete all saved addresses in `/profile`. Reload the checkout page. Confirm all `ship-*` fields stay empty (no console errors).
6. **Regression check:** with Address B set as default again, click "Proceed to Payment" after the fields autofill (or edit them first) — confirm checkout still proceeds to a real Stripe Checkout page exactly as before this change.

Expected: all six behaviors match.

- [ ] **Step 3: Commit and push**

```bash
git add checkout.html
git commit -m "Autofill checkout shipping fields from the logged-in user's default saved address"
git push
```
