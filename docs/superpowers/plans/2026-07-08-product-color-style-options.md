# Product Color & Style Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin add Color and Style as additional, optional variant dimensions alongside Size for custom products, with stock tracked per exact combination, and make a sold-out combination actually block checkout instead of just looking greyed out.

**Architecture:** Reuses the existing Shopify-style `option{N}_name`/`option{N}_value` fields already partially wired in `product.html` (today only `option1`/`option2` are read). `admin-products.html`'s per-row variant editor changes from "pick one dimension type + one value" to three parallel optional fields — Size (required per row) / Color (optional) / Style (optional) — each row is one specific combination with its own quantity. `product.html` is extended to build and render a third option group (`option3`) the same way it already handles `option2`, and `validateVariant()` gains a stock check so a depleted combination can't be added to cart or bought directly.

**Tech Stack:** Vanilla JS (no framework), no backend/API changes at all — this is purely `admin-products.html` (data entry) and `product.html` (storefront) changes to data already flowing through the existing `custom_products.variants` JSON column.

## Global Constraints

- Custom products (`custom_products` table) only — do not touch `products.json`, `product_overrides`, or any catalog-product code path. None of the 224 Shopify-imported products currently use more than `option1`.
- Size is always `option1` and is required on every variant row; Color is always `option2`; Style is always `option3`. Both Color and Style are optional, but within one product every row must consistently either use or omit a given dimension (e.g. don't leave Color blank on one row and filled on another row of the same product) — this is an admin data-entry discipline, not something the code enforces, so don't add validation for it (YAGNI — call it out in a UI placeholder/label instead if a task naturally allows it, but don't build a cross-row consistency checker).
- No new API file, no backend changes, no new Supabase column — everything here is existing `variants` JSON shape plus frontend rendering logic.
- No swatch/color-picker UI — Color and Style are free-text values exactly like Size is today.
- No auto-generated combination grid — the admin adds one row per combination by hand (this was the explicit, chosen design — do not build a matrix/generator).
- No frontend test runner exists in this project for HTML/inline-script files (Jest only covers `api/**`) — every task here is verified manually in a browser, following this repo's existing convention for `admin-products.html`/`product.html` changes.

---

### Task 1: `admin-products.html` — Size/Color/Style row fields

**Files:**
- Modify: `admin-products.html:68` (`.variant-row` CSS grid), `admin-products.html:451` (`openEditCustom`'s variant population call), `admin-products.html:470-482` (`addVariantRow`), `admin-products.html:484-497` (`getVariants`)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `getVariants()` now returns objects shaped `{ option1_name: 'Size', option1_value, price, qty, option2_name?: 'Color', option2_value?, option3_name?: 'Style', option3_value? }` — `option2_name`/`option2_value` and `option3_name`/`option3_value` are present only when the admin filled in that field for the row. Task 2 and Task 3 (both in `product.html`) consume exactly this shape via the existing `action=products` endpoint (no backend change needed — `custom_products.variants` already stores whatever JSON `getVariants()` produces).

- [ ] **Step 1: Update the CSS grid for the new row layout**

Current (`admin-products.html:68`):

```css
    .variant-row{display:grid;grid-template-columns:110px 1fr 80px 32px;gap:8px;margin-bottom:8px;align-items:center}
```

becomes (5 columns: Size, Color, Style, Qty, Delete):

```css
    .variant-row{display:grid;grid-template-columns:90px 90px 90px 70px 32px;gap:8px;margin-bottom:8px;align-items:center}
```

- [ ] **Step 2: Rewrite `addVariantRow` to take Size/Color/Style/Qty instead of a type dropdown**

Current (`admin-products.html:470-482`):

```js
  function addVariantRow(size = '', qty = 0, type = 'Size') {
    const rows = document.getElementById('variant-rows');
    const div = document.createElement('div');
    div.className = 'variant-row';
    const typeOpts = ['Size','Color','Style'].map(t =>
      `<option value="${t}"${t===type?' selected':''}>${t}</option>`).join('');
    div.innerHTML = `
      <select style="border:1px solid var(--border);padding:8px 6px;font-family:var(--font);font-size:12px;background:var(--white);cursor:pointer">${typeOpts}</select>
      <input type="text" placeholder="Value (e.g. S, Red, Floral)" value="${esc(String(size))}">
      <input type="number" min="0" placeholder="Qty" value="${qty}">
      <button class="var-del" onclick="this.parentElement.remove()">✕</button>`;
    rows.appendChild(div);
  }
```

becomes:

```js
  function addVariantRow(size = '', color = '', style = '', qty = 0) {
    const rows = document.getElementById('variant-rows');
    const div = document.createElement('div');
    div.className = 'variant-row';
    div.innerHTML = `
      <input type="text" placeholder="Size (e.g. S)" value="${esc(String(size))}">
      <input type="text" placeholder="Color (optional)" value="${esc(String(color))}">
      <input type="text" placeholder="Style (optional)" value="${esc(String(style))}">
      <input type="number" min="0" placeholder="Qty" value="${qty}">
      <button class="var-del" onclick="this.parentElement.remove()">✕</button>`;
    rows.appendChild(div);
  }
```

- [ ] **Step 3: Update the caller that repopulates rows when editing an existing custom product**

Current (`admin-products.html:451`, inside `openEditCustom`):

```js
    (p.variants || []).forEach(v => addVariantRow(v.option1_value, v.qty, v.option1_name || 'Size'));
```

becomes:

```js
    (p.variants || []).forEach(v => addVariantRow(v.option1_value, v.option2_value || '', v.option3_value || '', v.qty));
```

- [ ] **Step 4: Rewrite `getVariants` to read Size/Color/Style from the three text inputs**

Current (`admin-products.html:484-497`):

```js
  function getVariants() {
    const price = parseFloat(document.getElementById('ed-price').value) || 0;
    const rows = document.querySelectorAll('#variant-rows .variant-row');
    const vars = [];
    rows.forEach(row => {
      const sel = row.querySelector('select');
      const inputs = row.querySelectorAll('input');
      const optName = sel ? sel.value : 'Size';
      const optVal = inputs[0].value.trim();
      const qty = parseInt(inputs[1].value) || 0;
      if (optVal) vars.push({ option1_name: optName, option1_value: optVal, price, qty });
    });
    return vars;
  }
```

becomes:

```js
  function getVariants() {
    const price = parseFloat(document.getElementById('ed-price').value) || 0;
    const rows = document.querySelectorAll('#variant-rows .variant-row');
    const vars = [];
    rows.forEach(row => {
      const inputs = row.querySelectorAll('input');
      const sizeVal = inputs[0].value.trim();
      const colorVal = inputs[1].value.trim();
      const styleVal = inputs[2].value.trim();
      const qty = parseInt(inputs[3].value) || 0;
      if (!sizeVal) return;
      const v = { option1_name: 'Size', option1_value: sizeVal, price, qty };
      if (colorVal) { v.option2_name = 'Color'; v.option2_value = colorVal; }
      if (styleVal) { v.option3_name = 'Style'; v.option3_value = styleVal; }
      vars.push(v);
    });
    return vars;
  }
```

- [ ] **Step 5: Manual verification**

Run a local static server (e.g. `cd /Users/loren/Desktop/lypspace-clone && python3 -m http.server 8080`) and open `http://localhost:8080/admin-products.html`:

1. Log in, open "+ Add Product", scroll to "Variants & Stock Qty", click "+ Add Variant" — confirm you now see 4 blank inputs (Size, Color, Style, Qty) instead of a dropdown + 1 value field.
2. Fill Size=`S`, Color=`Red`, Style=`Floral`, Qty=`5`; add a second row Size=`S`, Color=`Blue`, Style=`Floral`, Qty=`3`. Fill in a product name/handle/price, save.
3. Reopen that product's editor — confirm both rows repopulate with the exact Size/Color/Style/Qty values you entered (this exercises Step 3's repopulation path).
4. Open browser dev tools, check the saved product's data via `fetch('/api/checkout?action=products&pw=<pw>').then(r=>r.json()).then(console.log)` (or inspect the Network tab on the save request) — confirm the two variants have `option1_name:'Size'`, `option2_name:'Color'`, `option3_name:'Style'` with the values you entered.
5. Create another product with only Size filled (Color/Style left blank on every row) — confirm `getVariants()` output for that product has no `option2_name`/`option3_name` keys at all (verify via the same network/console inspection).

- [ ] **Step 6: Commit and push**

```bash
git add admin-products.html
git commit -m "feat: replace variant type dropdown with Size/Color/Style fields"
git push
```

---

### Task 2: `product.html` — render and select a third option dimension (Style)

**Files:**
- Modify: `product.html:265-283` (option group building in `renderProduct`), `product.html:301-304` (`variantsHtml` assembly), `product.html:480-508` (`selectVariant`), `product.html:524-529` (`getVariantLabel`)

**Interfaces:**
- Consumes: `option3_name`/`option3_value` fields from Task 1's `getVariants()` output, delivered to the storefront unchanged via the existing `action=products` endpoint (no backend task needed).
- Produces: nothing new consumed by other tasks — Task 3 modifies `validateVariant()` in the same file but reads only `selectedVariant.qty`, which already exists regardless of how many option dimensions a variant has.

- [ ] **Step 1: Build a third option group (`opt3Groups`) alongside the existing two**

Current (`product.html:265-283`):

```js
      // Build option groups — normalise fragmented size names like "S/M/L" → "SIZE"
      const optGroups = {};
      const opt2Groups = {};
      if (hasVariants) {
        product.variants.forEach(v => {
          const key = normOptName(v.option1_name);
          if (!optGroups[key]) optGroups[key] = [];
          if (!optGroups[key].find(x => x.value === v.option1_value)) {
            optGroups[key].push({ value: v.option1_value, qty: v.qty, price: v.price });
          }
          if (v.option2_name && v.option2_value) {
            const key2 = normOptName(v.option2_name);
            if (!opt2Groups[key2]) opt2Groups[key2] = [];
            if (!opt2Groups[key2].find(x => x.value === v.option2_value)) {
              opt2Groups[key2].push({ value: v.option2_value, qty: v.qty, price: v.price });
            }
          }
        });
      }
```

becomes:

```js
      // Build option groups — normalise fragmented size names like "S/M/L" → "SIZE"
      const optGroups = {};
      const opt2Groups = {};
      const opt3Groups = {};
      if (hasVariants) {
        product.variants.forEach(v => {
          const key = normOptName(v.option1_name);
          if (!optGroups[key]) optGroups[key] = [];
          if (!optGroups[key].find(x => x.value === v.option1_value)) {
            optGroups[key].push({ value: v.option1_value, qty: v.qty, price: v.price });
          }
          if (v.option2_name && v.option2_value) {
            const key2 = normOptName(v.option2_name);
            if (!opt2Groups[key2]) opt2Groups[key2] = [];
            if (!opt2Groups[key2].find(x => x.value === v.option2_value)) {
              opt2Groups[key2].push({ value: v.option2_value, qty: v.qty, price: v.price });
            }
          }
          if (v.option3_name && v.option3_value) {
            const key3 = normOptName(v.option3_name);
            if (!opt3Groups[key3]) opt3Groups[key3] = [];
            if (!opt3Groups[key3].find(x => x.value === v.option3_value)) {
              opt3Groups[key3].push({ value: v.option3_value, qty: v.qty, price: v.price });
            }
          }
        });
      }
```

- [ ] **Step 2: Include the third group when assembling `variantsHtml`**

Current (`product.html:301-304`):

```js
      const variantsHtml = [
        ...Object.entries(optGroups).map(([n, o]) => renderOptGroup(n, o)),
        ...Object.entries(opt2Groups).map(([n, o]) => renderOptGroup(n, o)),
      ].join('');
```

becomes:

```js
      const variantsHtml = [
        ...Object.entries(optGroups).map(([n, o]) => renderOptGroup(n, o)),
        ...Object.entries(opt2Groups).map(([n, o]) => renderOptGroup(n, o)),
        ...Object.entries(opt3Groups).map(([n, o]) => renderOptGroup(n, o)),
      ].join('');
```

- [ ] **Step 3: Extend `selectVariant` to match and auto-highlight a third dimension**

Current (`product.html:480-508`):

```js
    const _selectedOpts = {};
    function selectVariant(optName, val) {
      _selectedOpts[optName] = val;
      document.querySelectorAll(`.var-btn[data-opt="${optName}"]`).forEach(b => {
        b.classList.toggle('active', b.dataset.val === val);
      });
      selectedVariant = product.variants.find(v => {
        const k1 = normOptName(v.option1_name);
        const k2 = v.option2_name ? normOptName(v.option2_name) : null;
        const m1 = !_selectedOpts[k1] || _selectedOpts[k1] === v.option1_value;
        const m2 = !k2 || !_selectedOpts[k2] || _selectedOpts[k2] === v.option2_value;
        return m1 && m2;
      }) || null;
      // Auto-highlight option2 when option1 is picked (and vice versa)
      if (selectedVariant) {
        if (selectedVariant.option2_name && selectedVariant.option2_value) {
          const k2 = normOptName(selectedVariant.option2_name);
          if (!_selectedOpts[k2]) {
            _selectedOpts[k2] = selectedVariant.option2_value;
            document.querySelectorAll(`.var-btn[data-opt="${k2}"]`).forEach(b => {
              b.classList.toggle('active', b.dataset.val === selectedVariant.option2_value);
            });
          }
        }
      }
      const base = selectedVariant ? selectedVariant.price : product.price;
      document.getElementById('price-display').innerHTML = priceDisplayHtml(base);
      const err = document.getElementById('variant-err');
      if (err) err.style.display = 'none';
    }
```

becomes:

```js
    const _selectedOpts = {};
    function selectVariant(optName, val) {
      _selectedOpts[optName] = val;
      document.querySelectorAll(`.var-btn[data-opt="${optName}"]`).forEach(b => {
        b.classList.toggle('active', b.dataset.val === val);
      });
      selectedVariant = product.variants.find(v => {
        const k1 = normOptName(v.option1_name);
        const k2 = v.option2_name ? normOptName(v.option2_name) : null;
        const k3 = v.option3_name ? normOptName(v.option3_name) : null;
        const m1 = !_selectedOpts[k1] || _selectedOpts[k1] === v.option1_value;
        const m2 = !k2 || !_selectedOpts[k2] || _selectedOpts[k2] === v.option2_value;
        const m3 = !k3 || !_selectedOpts[k3] || _selectedOpts[k3] === v.option3_value;
        return m1 && m2 && m3;
      }) || null;
      // Auto-highlight option2/option3 when the other dimensions are picked
      if (selectedVariant) {
        if (selectedVariant.option2_name && selectedVariant.option2_value) {
          const k2 = normOptName(selectedVariant.option2_name);
          if (!_selectedOpts[k2]) {
            _selectedOpts[k2] = selectedVariant.option2_value;
            document.querySelectorAll(`.var-btn[data-opt="${k2}"]`).forEach(b => {
              b.classList.toggle('active', b.dataset.val === selectedVariant.option2_value);
            });
          }
        }
        if (selectedVariant.option3_name && selectedVariant.option3_value) {
          const k3 = normOptName(selectedVariant.option3_name);
          if (!_selectedOpts[k3]) {
            _selectedOpts[k3] = selectedVariant.option3_value;
            document.querySelectorAll(`.var-btn[data-opt="${k3}"]`).forEach(b => {
              b.classList.toggle('active', b.dataset.val === selectedVariant.option3_value);
            });
          }
        }
      }
      const base = selectedVariant ? selectedVariant.price : product.price;
      document.getElementById('price-display').innerHTML = priceDisplayHtml(base);
      const err = document.getElementById('variant-err');
      if (err) err.style.display = 'none';
    }
```

- [ ] **Step 4: Include the third dimension's value in the cart/checkout label**

Current (`product.html:524-529`):

```js
    function getVariantLabel() {
      if (!selectedVariant) return '';
      let label = selectedVariant.option1_value || '';
      if (selectedVariant.option2_value) label += ' / ' + selectedVariant.option2_value;
      return label ? ` (${label})` : '';
    }
```

becomes:

```js
    function getVariantLabel() {
      if (!selectedVariant) return '';
      let label = selectedVariant.option1_value || '';
      if (selectedVariant.option2_value) label += ' / ' + selectedVariant.option2_value;
      if (selectedVariant.option3_value) label += ' / ' + selectedVariant.option3_value;
      return label ? ` (${label})` : '';
    }
```

- [ ] **Step 5: Manual verification**

Using the two variants created in Task 1's verification (Size S/Color Red/Style Floral qty 5, and Size S/Color Blue/Style Floral qty 3) on a test product:

1. Open that product's page (`/product?h=<handle>`) — confirm you see three separate selector groups: SIZE, Color, Style (exact labels reflect whatever `option1_name`/`option2_name`/`option3_name` you saved — "Size"/"Color"/"Style" per Task 1's fixed naming).
2. Click "S" — confirm nothing crashes and price updates.
3. Click "Red" — confirm the price/selection still resolves (auto-highlighting may also light up "Floral" since both your test rows share that Style value).
4. Click "Add to Cart" — open the cart sidebar and confirm the line item reads "Test Product (S / Red / Floral)" (or whatever title you used), confirming `getVariantLabel()` includes all three parts.
5. Click "Buy Now" — confirm the URL's `name` query param is URL-encoded text ending in `(S / Blue / Floral)` or similar if you picked the other Color.
6. Regression check: open a product that only has Size (no Color/Style) — confirm it still shows just one selector group and behaves exactly as before this change.

- [ ] **Step 6: Commit and push**

```bash
git add product.html
git commit -m "feat: support a third variant dimension (Style) on product pages"
git push
```

---

### Task 3: `product.html` — block checkout on a sold-out combination

**Files:**
- Modify: `product.html:515-522` (`validateVariant`)

**Interfaces:**
- Consumes: `selectedVariant.qty` — already set by Task 2's `selectVariant()` (unchanged field, works identically whether a variant has 1, 2, or 3 option dimensions).
- Produces: nothing consumed by other tasks — this is the last task in this plan.

- [ ] **Step 1: Add a stock check to `validateVariant`**

Current (`product.html:515-522`):

```js
    function validateVariant() {
      if (product.variants && product.variants.length > 0 && !selectedVariant) {
        const err = document.getElementById('variant-err');
        if (err) err.style.display = 'block';
        return false;
      }
      return true;
    }
```

becomes:

```js
    function validateVariant() {
      const err = document.getElementById('variant-err');
      if (product.variants && product.variants.length > 0 && !selectedVariant) {
        if (err) { err.textContent = 'Please select a size / option'; err.style.display = 'block'; }
        return false;
      }
      if (selectedVariant && selectedVariant.qty <= 0) {
        if (err) { err.textContent = 'This combination is sold out'; err.style.display = 'block'; }
        return false;
      }
      return true;
    }
```

No other function needs to change: `addToCart()` (`product.html:531-542`) and `buyNow()` (`product.html:562-567`) both already call `validateVariant()` first and return immediately on `false` — this one function change blocks both paths automatically.

- [ ] **Step 2: Manual verification**

1. In `admin-products.html`, set a variant's Qty to `0` for one specific combination (e.g. Size S / Color Red / Style Floral → Qty 0), save.
2. Open that product's page, select that exact combination (S, Red, Floral) — confirm the "S" (or whichever) button shows the existing greyed-out/struck-through `.out` styling as before (Task 2 doesn't change that visual, it's pre-existing).
3. Click "Add to Cart" — confirm it does **not** add to cart, and the error message now reads "This combination is sold out" (not the generic "Please select a size / option" text).
4. Click "Buy Now" — confirm it does **not** navigate to `/checkout`.
5. Regression check: select a combination that still has stock (e.g. S / Blue / Floral, qty 3) — confirm Add to Cart and Buy Now both work exactly as before, with no error shown.
6. Regression check: on a product with no variants at all (e.g. the Rip Curl bikini or a Quick Payment Link product), confirm Add to Cart / Buy Now still work with no variant-related error (this path never reaches the new `selectedVariant.qty <= 0` check since `selectedVariant` is always `null` for a no-variant product).

- [ ] **Step 3: Commit and push**

```bash
git add product.html
git commit -m "fix: block add-to-cart and buy-now when the selected variant is sold out"
git push
```

---

## Post-implementation check

After all 3 tasks are done, do one end-to-end pass by hand:
1. Create a custom product with two Size values, each available in two Colors (4 total variant rows), no Style.
2. Confirm the product page shows Size and Color groups only (no empty "Style" group), every combination's stock is independent, and picking a combination with 0 stock blocks checkout with the new message.
3. Create a second custom product using all three dimensions (Size + Color + Style) and confirm the cart/checkout line item shows all three parts in the label.
4. Confirm a plain single-price product (no variants) and an existing Size-only custom product both still work exactly as before (no regression from generalizing to a third dimension).
