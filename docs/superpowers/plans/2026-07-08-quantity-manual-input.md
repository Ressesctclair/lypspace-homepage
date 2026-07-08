# Quantity Manual Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer type a quantity directly on a product page (in addition to the existing `−`/`+` buttons), with a live, non-blocking red "Exceeds stock" warning when the typed number is more than what's currently in stock for the selected variant (or the whole product, if it has no variants).

**Architecture:** The quantity display changes from a plain `<span>` to a `<input type="number">`, styled like `catalog.html`'s existing page-jump input. A single `checkQtyWarning()` helper compares the module-level `qty` against whichever stock number currently applies (`selectedVariant.qty` if a variant is resolved, else `product.total_qty`) and toggles a reused `.error-msg` element. Both the `+`/`−` buttons and direct typing funnel through this same check, and it's also re-run when the customer changes their variant selection, so the warning never goes stale.

**Tech Stack:** Vanilla JS (no framework) — this is a single-file, client-side-only change to `product.html`. No backend/API change, no new Supabase column.

## Global Constraints

- The warning is purely informational — it must never block "Add to Cart" or "Buy Now" (this is a deliberate choice from the design, not an oversight — do not wire it into `validateVariant()`).
- An empty, zero, negative, or non-numeric typed value is treated as `1` for calculation purposes (matching `changeQty`'s existing `Math.max(1, ...)` floor) and must not itself trigger the stock warning.
- No new maximum-quantity hard cap and no change to `catalog.html` — only its `.pg-jump input` styling is used as a visual reference.
- No frontend test runner exists in this project for HTML/inline-script files — verify manually in a browser, consistent with every other `product.html` task in this project.

---

### Task 1: `product.html` — typeable quantity input with live over-stock warning

**Files:**
- Modify: `product.html:117` (`.qty-num` CSS), `product.html:339-343` (qty-control HTML), `product.html:485-508` (`selectVariant`, to re-run the check on variant change), `product.html:530-533` (`changeQty`)

**Interfaces:**
- Consumes: `selectedVariant` (set by the existing `selectVariant()`), `product.total_qty` (already loaded per-product), both already used elsewhere in this file for sold-out logic.
- Produces: nothing consumed by other tasks — this is the only task in this plan.

- [ ] **Step 1: Update `.qty-num` CSS so the input fits the existing bordered control**

Current (`product.html:117`):

```css
    .qty-num { width: 40px; text-align: center; font-size: 14px; }
```

becomes:

```css
    .qty-num { width: 40px; height: 40px; text-align: center; font-size: 14px; border: none; outline: none; background: none; color: var(--black); font-family: var(--font); }
```

- [ ] **Step 2: Replace the quantity `<span>` with a typeable `<input>`, and add the warning element**

Current (`product.html:339-343`):

```html
              <div class="qty-control">
                <button class="qty-btn" onclick="changeQty(-1)">−</button>
                <span class="qty-num" id="qty-display">1</span>
                <button class="qty-btn" onclick="changeQty(1)">+</button>
              </div>
```

becomes:

```html
              <div class="qty-control">
                <button class="qty-btn" onclick="changeQty(-1)">−</button>
                <input type="number" min="1" class="qty-num" id="qty-display" value="1" oninput="onQtyInput()">
                <button class="qty-btn" onclick="changeQty(1)">+</button>
              </div>
              <p class="error-msg" id="qty-warn">Exceeds stock</p>
```

(`.error-msg` already exists at `product.html:130` — red text, `display:none` by default — so `#qty-warn` starts hidden with no extra CSS needed.)

- [ ] **Step 3: Add `checkQtyWarning()` and `onQtyInput()`, and update `changeQty()` to use the input's `.value` and re-run the check**

Current (`product.html:530-533`):

```js
    function changeQty(d) {
      qty = Math.max(1, qty + d);
      document.getElementById('qty-display').textContent = qty;
    }
```

becomes:

```js
    function changeQty(d) {
      qty = Math.max(1, qty + d);
      document.getElementById('qty-display').value = qty;
      checkQtyWarning();
    }

    function onQtyInput() {
      const el = document.getElementById('qty-display');
      const parsed = parseInt(el.value, 10);
      qty = (!parsed || parsed < 1) ? 1 : parsed;
      checkQtyWarning();
    }

    function checkQtyWarning() {
      const warn = document.getElementById('qty-warn');
      if (!warn) return;
      const stockRef = selectedVariant ? selectedVariant.qty : product.total_qty;
      warn.style.display = (qty > stockRef) ? 'block' : 'none';
    }
```

Note: `onQtyInput()` deliberately does NOT overwrite `el.value` when the typed value is invalid (empty/0/negative/non-numeric) — only the internal `qty` variable is clamped to `1`. Rewriting the visible field while the customer is still typing (e.g. they clear it to type a new number) would fight their input. The field only ever shows what they actually typed, or what `changeQty()` explicitly sets.

- [ ] **Step 4: Re-run the stock check when the customer changes their variant selection**

In `selectVariant()` (`product.html:485-508`), the function already ends with:

```js
      const base = selectedVariant ? selectedVariant.price : product.price;
      document.getElementById('price-display').innerHTML = priceDisplayHtml(base);
      const err = document.getElementById('variant-err');
      if (err) err.style.display = 'none';
    }
```

Add a call to the new check right after that, so switching variants (e.g. from an in-stock color to a low-stock one) immediately re-evaluates the warning without the customer needing to touch the quantity field:

```js
      const base = selectedVariant ? selectedVariant.price : product.price;
      document.getElementById('price-display').innerHTML = priceDisplayHtml(base);
      const err = document.getElementById('variant-err');
      if (err) err.style.display = 'none';
      checkQtyWarning();
    }
```

- [ ] **Step 5: Manual verification**

Run a local static server (e.g. `cd /Users/loren/Desktop/lypspace-clone && python3 -m http.server 8080`) and open `http://localhost:8080/product?h=<a-custom-product-handle-with-known-stock>`:

1. Confirm the quantity control now shows an actual input box (with a text cursor on click) between the `−`/`+` buttons, not a plain number.
2. Click `+` several times past the known stock count — confirm "Exceeds stock" appears in red once you pass it, and disappears if you click `−` back under it.
3. Click directly into the box, clear it, and type a number greater than stock — confirm the warning appears as you type (no need to click away or submit).
4. Type a number at or below stock — confirm the warning disappears.
5. Clear the box entirely, or type `0` or `-5` — confirm no warning shows (invalid input is treated as 1, not compared against stock).
6. With quantity still over stock, click "Add to Cart" and "Buy Now" — confirm **both still work** (the warning must not block either).
7. On a product with Size/Color/Style variants (from the earlier Color/Style feature): set a high quantity that's fine for one combination, then switch to a combination with lower stock — confirm the warning appears immediately upon switching, without touching the quantity field.
8. Regression check: on a product with no variants at all, confirm the quantity control still works exactly as before (typing, `+`/`−`, and the warning comparing against `product.total_qty`).

- [ ] **Step 6: Commit and push**

```bash
git add product.html
git commit -m "feat: allow typing product quantity directly, warn when it exceeds stock"
git push
```
