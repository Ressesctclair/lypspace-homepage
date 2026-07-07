# Unlisted Payment Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin (1) delist an existing custom product from the catalog grid/search while its direct product-page link still works, and (2) generate a one-off private payment link (custom title + price) that isn't listed anywhere but is payable indefinitely until the admin disables it.

**Architecture:** One new boolean column (`unlisted`) on the existing `custom_products` Supabase table, persisted through the existing `create-product` action in `api/checkout.js` — no new API file (Vercel Hobby 12-function limit is already maxed). `catalog.html` filters `unlisted` items out of its listing/search; `product.html`, `checkout.html`, discount stacking, shipping collection, and `order_links`/`admin-orders.html` all need zero changes because unlisted products flow through the exact same `custom_products` → checkout → order pipeline as any other custom product. `admin-products.html` gets (a) an "Unlisted" checkbox on the existing product editor and (b) a new lightweight "Quick Payment Link" panel that auto-generates a random handle and pre-sets `unlisted: true`.

**Tech Stack:** Vanilla JS (no framework), Vercel serverless functions (Node.js), Supabase (Postgres), Jest for backend tests (no frontend test runner exists in this project — `admin-products.html`/`catalog.html` changes are verified manually in a browser).

## Global Constraints

- Do not create a new file under `api/` — the project is at Vercel Hobby's 12-function limit. All backend changes go into the existing `api/checkout.js`.
- Do not touch the Stripe Express Checkout init timing or the in-app-browser banner logic in `js/cart.js` — frozen per user instruction. This feature does not need to touch `js/cart.js` at all.
- Do not modify `#img-deck1`–`#img-deck4` positioning in `index.html` — unrelated to this feature, called out only because it's a standing rule for this repo.
- This feature only applies to `custom_products` (admin-created products) — never to `products.json`/Shopify-imported catalog products or `product_overrides`.
- Commit after every task and push to `main` (this repo auto-deploys on push — the user's stated preference is to push immediately rather than batching).
- Per current site policy, any further logic/section changes beyond what's in this approved plan must be confirmed with the user before implementing — this plan itself is the confirmed scope, so no additional confirmation is needed mid-plan unless a task's approach must change.

---

### Task 1: Add `unlisted` column to `custom_products`

**Files:**
- None in the repo — manual Supabase dashboard step (no local migration tooling exists in this project; no `supabase/migrations` folder or CLI config present).

**Interfaces:**
- Produces: an `unlisted boolean not null default false` column on `custom_products`, selectable via the existing `select('*')` call in `api/checkout.js`'s `action=products` handler. Every later task depends on this column existing.

- [ ] **Step 1: Run the migration SQL**

Tell the user to open the Supabase project (nabpehsaifbgzezptyle) SQL editor and run:

```sql
alter table custom_products add column if not exists unlisted boolean not null default false;
```

- [ ] **Step 2: Verify the column exists**

Ask the user to confirm (or run, if you have Supabase access configured) this check returns a row with `column_name = 'unlisted'`:

```sql
select column_name from information_schema.columns where table_name = 'custom_products' and column_name = 'unlisted';
```

- [ ] **Step 3: Commit**

Nothing to commit for this task (no repo files changed) — proceed to Task 2.

---

### Task 2: Backend — persist `unlisted` on `create-product`, with a stock sentinel for link-only products

**Files:**
- Modify: `api/checkout.js:148-161` (`create-product` action)
- Test: `api/__tests__/checkout.test.js`

**Interfaces:**
- Consumes: the `unlisted` column from Task 1.
- Produces: `create-product` now accepts an optional `unlisted` boolean in the POST body, persists it as-is (`!!unlisted`), and — when no `variants` are supplied and `unlisted` is `true` — sets `total_qty` to `999999` instead of `0` so the product is never treated as sold out on `product.html` (which computes `soldOut = product.total_qty <= 0` for custom products with no per-variant override). When variants *are* supplied, `total_qty` is still the real sum regardless of `unlisted`. When `unlisted` is falsy and no variants are supplied, `total_qty` stays `0` exactly as today (no regression for normal draft/no-stock custom products). Task 4 (admin editor) and Task 5 (quick-link panel) both rely on sending this `unlisted` field with this exact name.

- [ ] **Step 1: Write the failing tests**

Add these five tests inside the existing `describe('action=create-product', ...)` block in `api/__tests__/checkout.test.js` (after the existing `'sale_price defaults to null when omitted'` test, before the block's closing `});`):

```js
  test('persists unlisted=true when provided', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ upsert }) });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { action: 'create-product', password: 'test-admin-pw', handle: 'link-abc123', title: 'Custom Order', price: '150', unlisted: true },
    }, res);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ handle: 'link-abc123', unlisted: true }));
  });

  test('unlisted defaults to false when omitted', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ upsert }) });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { action: 'create-product', password: 'test-admin-pw', handle: 'floral-set', title: 'Floral Set', price: '100' },
    }, res);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ unlisted: false }));
  });

  test('sets a large total_qty sentinel for an unlisted product with no variants', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ upsert }) });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { action: 'create-product', password: 'test-admin-pw', handle: 'link-abc123', title: 'Custom Order', price: '150', unlisted: true },
    }, res);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ total_qty: 999999 }));
  });

  test('keeps total_qty at 0 for a non-unlisted product with no variants (no regression)', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ upsert }) });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { action: 'create-product', password: 'test-admin-pw', handle: 'floral-set', title: 'Floral Set', price: '100' },
    }, res);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ total_qty: 0 }));
  });

  test('uses the real variant total when an unlisted product has variants', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ upsert }) });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: {
        action: 'create-product', password: 'test-admin-pw', handle: 'link-abc123', title: 'Custom Order', price: '150', unlisted: true,
        variants: [{ option1_name: 'Size', option1_value: 'M', price: 150, qty: 3 }],
      },
    }, res);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ total_qty: 3 }));
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest checkout.test.js -t "create-product"`
Expected: FAIL — `unlisted` isn't read or persisted yet, and `total_qty` has no sentinel branch, so the `unlisted`/`total_qty: 999999` assertions fail (the `total_qty: 0` and variant-sum tests should already pass since that part of the logic is unchanged, but run them anyway to confirm no accidental breakage from the diff).

- [ ] **Step 3: Implement it**

In `api/checkout.js`, the current block (lines 148-161):

```js
  if (action === 'create-product') {
    const { password, handle, title, type, price, sale_price, description, images, variants } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    if (!handle || !title) return res.status(400).json({ error: 'handle and title required' });
    const supabase = getSupabase();
    const total_qty = (variants || []).reduce((s, v) => s + (parseInt(v.qty) || 0), 0);
    await supabase.from('custom_products').upsert({
      handle, title, type: type || '', price: parseFloat(price) || 0,
      sale_price: sale_price ? parseFloat(sale_price) : null,
      description: description || '', images: images || [], variants: variants || [],
      total_qty, created_at: new Date().toISOString()
    });
    return res.status(200).json({ ok: true });
  }
```

becomes:

```js
  if (action === 'create-product') {
    const { password, handle, title, type, price, sale_price, description, images, variants, unlisted } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    if (!handle || !title) return res.status(400).json({ error: 'handle and title required' });
    const supabase = getSupabase();
    const hasVariants = variants && variants.length > 0;
    const total_qty = hasVariants
      ? variants.reduce((s, v) => s + (parseInt(v.qty) || 0), 0)
      : (unlisted ? 999999 : 0);
    await supabase.from('custom_products').upsert({
      handle, title, type: type || '', price: parseFloat(price) || 0,
      sale_price: sale_price ? parseFloat(sale_price) : null,
      description: description || '', images: images || [], variants: variants || [],
      unlisted: !!unlisted,
      total_qty, created_at: new Date().toISOString()
    });
    return res.status(200).json({ ok: true });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest checkout.test.js`
Expected: PASS — every test in the file, including the pre-existing `create-product`/`product-update`/sale-price tests (none of them pass `variants` or `unlisted`, so they hit the same `total_qty: 0` / `unlisted: false` path as before).

- [ ] **Step 5: Commit and push**

```bash
git add api/checkout.js api/__tests__/checkout.test.js
git commit -m "feat: add unlisted flag and stock sentinel to create-product"
git push
```

---

### Task 3: `catalog.html` — hide unlisted custom products from the grid and search

**Files:**
- Modify: `catalog.html:178-182` (`loadProducts`)

**Interfaces:**
- Consumes: the `unlisted` field on rows returned by `/api/checkout?action=products` (Task 1/2).
- Produces: nothing consumed by later tasks — `product.html` and checkout fetch custom products independently and don't share state with `catalog.html`.

- [ ] **Step 1: Filter unlisted products out when merging them into `allProducts`**

The current block in `loadProducts()` (lines 178-182):

```js
      if (customRes && customRes.ok) {
        const cd = await customRes.json();
        const customs = (cd.products || []).map(p => ({ ...p, images: p.images || [], variants: p.variants || [], _custom: true }));
        allProducts = [...customs, ...allProducts];
      }
```

becomes:

```js
      if (customRes && customRes.ok) {
        const cd = await customRes.json();
        const customs = (cd.products || [])
          .filter(p => !p.unlisted)
          .map(p => ({ ...p, images: p.images || [], variants: p.variants || [], _custom: true }));
        allProducts = [...customs, ...allProducts];
      }
```

Since `unlisted` products never enter `allProducts`, they're automatically excluded from category filters, search, and pagination too — no other line in this file needs to change.

- [ ] **Step 2: Manual verification**

1. In `admin-products.html`, mark an existing custom product as Unlisted (this checkbox is added in Task 4 — come back to this verification after Task 4 is done, or temporarily set `unlisted: true` directly in the Supabase table editor to test Task 3 in isolation).
2. Open `/catalog` — confirm that product no longer appears in the grid, and searching for its exact title returns no results.
3. Confirm all other products (catalog + non-unlisted custom) still render normally, and pagination/category counts aren't off by one from a phantom item.

- [ ] **Step 3: Commit and push**

```bash
git add catalog.html
git commit -m "feat: hide unlisted custom products from catalog grid and search"
git push
```

---

### Task 4: `admin-products.html` — "Unlisted" checkbox on the product editor

**Files:**
- Modify: `admin-products.html:190-193` (editor HTML, next to the Hidden checkbox), `admin-products.html:304-309` (`productRow` badges), `admin-products.html:333` (`openCreate`), `admin-products.html:396-404` (`openEditCustom`), `admin-products.html:548-556` (`saveProduct`, custom-product body)

**Interfaces:**
- Consumes: the `unlisted` field from Task 2's `create-product` action and from rows returned by `action=products` (already flows through automatically once the DB column exists — no extra fetch needed, unlike the existing `hidden` checkbox which requires a separate `action=settings` call).
- Produces: nothing new consumed by later tasks — Task 5's quick-link panel calls `create-product` directly with its own `unlisted: true`, independent of this editor.

- [ ] **Step 1: Add the checkbox to the editor HTML**

Right after the existing Hidden checkbox (lines 190-193):

```html
    <div class="field" style="display:flex;align-items:center;gap:10px;margin-top:8px">
      <input type="checkbox" id="ed-hidden" style="width:18px;height:18px;cursor:pointer">
      <label for="ed-hidden" style="cursor:pointer;font-size:13px">Hidden (Draft — only you can see this product)</label>
    </div>
```

insert:

```html
    <div class="field" style="display:flex;align-items:center;gap:10px;margin-top:8px">
      <input type="checkbox" id="ed-unlisted" style="width:18px;height:18px;cursor:pointer">
      <label for="ed-unlisted" style="cursor:pointer;font-size:13px">Unlisted (not shown in Catalog, but the product link still works)</label>
    </div>
```

(The existing "Copy URL" button next to the Handle field, line 134, already lets the admin grab this product's link — no new copy button needed for this checkbox.)

- [ ] **Step 2: Reset the checkbox in `openCreate()`**

Current line 333:

```js
    document.getElementById('ed-hidden').checked = false;
```

Add right after it:

```js
    document.getElementById('ed-unlisted').checked = false;
```

- [ ] **Step 3: Populate the checkbox in `openEditCustom()`**

Current lines 396-404:

```js
    document.getElementById('ed-sale-price').value = p.sale_price != null ? p.sale_price : '';
    document.getElementById('ed-desc').value = p.description || '';
    document.getElementById('ed-images').value = (p.images || []).join('\n');
    document.getElementById('ed-msg').style.display = 'none';
    document.getElementById('ed-hidden').checked = false;
    fetch('/api/checkout?action=settings').then(r=>r.json()).then(({settings})=>{
      const hidden = JSON.parse((settings && settings.hidden_products) || '[]');
      document.getElementById('ed-hidden').checked = hidden.includes(handle);
    }).catch(()=>{});
```

add, right after the `ed-images` line:

```js
    document.getElementById('ed-unlisted').checked = !!p.unlisted;
```

so the block becomes:

```js
    document.getElementById('ed-sale-price').value = p.sale_price != null ? p.sale_price : '';
    document.getElementById('ed-desc').value = p.description || '';
    document.getElementById('ed-images').value = (p.images || []).join('\n');
    document.getElementById('ed-unlisted').checked = !!p.unlisted;
    document.getElementById('ed-msg').style.display = 'none';
    document.getElementById('ed-hidden').checked = false;
    fetch('/api/checkout?action=settings').then(r=>r.json()).then(({settings})=>{
      const hidden = JSON.parse((settings && settings.hidden_products) || '[]');
      document.getElementById('ed-hidden').checked = hidden.includes(handle);
    }).catch(()=>{});
```

(`p.unlisted` is present directly on the `custom_products` row from `action=products` — this doesn't need the `action=settings` round-trip that `hidden` requires.)

- [ ] **Step 4: Send `unlisted` in the save payload**

Current custom-product body in `saveProduct()` (lines 548-556):

```js
        body = {
          action: 'create-product', password,
          handle, title,
          type: document.getElementById('ed-type').value.trim(),
          price: document.getElementById('ed-price').value,
          sale_price: document.getElementById('ed-sale-price').value,
          description: document.getElementById('ed-desc').value,
          images, variants,
        };
```

becomes:

```js
        body = {
          action: 'create-product', password,
          handle, title,
          type: document.getElementById('ed-type').value.trim(),
          price: document.getElementById('ed-price').value,
          sale_price: document.getElementById('ed-sale-price').value,
          description: document.getElementById('ed-desc').value,
          images, variants,
          unlisted: document.getElementById('ed-unlisted').checked,
        };
```

- [ ] **Step 5: Show an "Unlisted" badge in the product list row**

Current badges block in `productRow()` (lines 304-309):

```js
        <div class="badges">
          ${p._custom ? '<span class="badge custom">Custom</span>' : ''}
          <span class="badge ${inStock ? 'in-stock' : 'sold-out'}">${inStock ? 'In Stock' : 'Sold Out'}</span>
          ${(p.variants||[]).length ? `<span class="badge">${p.variants.length} sizes</span>` : ''}
          ${onSale ? '<span class="badge" style="background:#c00;color:#fff;border-color:#c00">On Sale</span>' : ''}
        </div>
```

becomes:

```js
        <div class="badges">
          ${p._custom ? '<span class="badge custom">Custom</span>' : ''}
          <span class="badge ${inStock ? 'in-stock' : 'sold-out'}">${inStock ? 'In Stock' : 'Sold Out'}</span>
          ${(p.variants||[]).length ? `<span class="badge">${p.variants.length} sizes</span>` : ''}
          ${onSale ? '<span class="badge" style="background:#c00;color:#fff;border-color:#c00">On Sale</span>' : ''}
          ${p.unlisted ? '<span class="badge" style="background:#fff3cd;color:#856404;border-color:#ffe69c">Unlisted</span>' : ''}
        </div>
```

- [ ] **Step 6: Manual verification**

1. Open `/admin-products.html`, log in, open an existing custom product's editor.
2. Check "Unlisted", save — confirm the product list row now shows an "Unlisted" badge.
3. Reopen the same product's editor — confirm the Unlisted checkbox is still checked (persisted correctly).
4. Click "Copy URL" next to the Handle field — confirm it copies `https://lypspace.digital/product?h=<handle>`.
5. Open that URL directly (in an incognito window, so no admin `pw` in localStorage) — confirm the product page loads normally and "Buy Now"/"Add to Cart" work.
6. Go to `/catalog` — confirm this product does **not** appear in the grid or in search (ties back to Task 3).
7. Uncheck Unlisted, save — confirm the product reappears in `/catalog`.

- [ ] **Step 7: Commit and push**

```bash
git add admin-products.html
git commit -m "feat: add Unlisted checkbox to custom product editor"
git push
```

---

### Task 5: `admin-products.html` — "Quick Payment Link" panel

**Files:**
- Modify: `admin-products.html:104` (toolbar button), `admin-products.html:201` (new overlay markup, inserted after the existing editor overlay's closing `</div>`), `admin-products.html:652` (new JS functions, inserted after `copyProductUrl()`)

**Interfaces:**
- Consumes: the `create-product` action from Task 2 (`unlisted: true`, no `variants`, triggering the `total_qty: 999999` sentinel); the global `password` variable already set by `doLogin()`.
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Add the toolbar button**

Current line 104:

```html
    <button class="btn" onclick="openCreate()">+ Add Product</button>
```

Add right after it:

```html
    <button class="btn outline" onclick="openQuickLink()">+ Quick Payment Link</button>
```

- [ ] **Step 2: Add the overlay markup**

Right after the existing editor overlay's closing tags (after line 201, `</div>\n</div>`, and before the `<script>` tag on line 203):

```html
<!-- Quick payment link overlay -->
<div class="editor-overlay" id="quick-link-overlay">
  <div class="editor" style="max-width:440px">
    <button class="editor-close" onclick="closeQuickLink()">✕</button>
    <h2>Quick Payment Link</h2>
    <div class="field">
      <label>Title</label>
      <input type="text" id="ql-title" placeholder="e.g. Custom order for Lisa">
    </div>
    <div class="field">
      <label>Price (USD)</label>
      <input type="number" id="ql-price" step="0.01" min="0" placeholder="e.g. 150.00">
    </div>
    <div class="msg" id="ql-msg"></div>
    <div id="ql-result" style="display:none;margin-top:8px">
      <label style="display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--gray);margin-bottom:7px">Payment Link</label>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="text" id="ql-url" readonly style="flex:1">
        <button type="button" onclick="copyQuickLinkUrl()" style="flex-shrink:0;padding:10px 14px;border:1px solid var(--border);background:none;cursor:pointer;font-family:var(--font);font-size:12px;white-space:nowrap">Copy</button>
      </div>
      <div id="ql-copy-tip" style="font-size:11px;color:#1a7f37;margin-top:4px;display:none">Copied!</div>
    </div>
    <div class="save-row">
      <button class="btn" id="ql-create-btn" onclick="createQuickLink()">Create Link</button>
      <button class="btn outline" onclick="closeQuickLink()">Close</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add the JS functions**

Right after `copyProductUrl()` (after line 652, before `function esc(...)`):

```js
  function openQuickLink() {
    document.getElementById('ql-title').value = '';
    document.getElementById('ql-price').value = '';
    document.getElementById('ql-msg').style.display = 'none';
    document.getElementById('ql-result').style.display = 'none';
    document.getElementById('ql-create-btn').disabled = false;
    document.getElementById('quick-link-overlay').classList.add('open');
  }

  function closeQuickLink() {
    document.getElementById('quick-link-overlay').classList.remove('open');
  }

  function generateLinkHandle() {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return 'link-' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function createQuickLink() {
    const msgEl = document.getElementById('ql-msg');
    msgEl.style.display = 'none';
    const title = document.getElementById('ql-title').value.trim();
    const price = parseFloat(document.getElementById('ql-price').value);
    if (!title) { msgEl.textContent = 'Title is required'; msgEl.className = 'msg err'; msgEl.style.display = 'block'; return; }
    if (isNaN(price) || price <= 0) { msgEl.textContent = 'Enter a price greater than 0'; msgEl.className = 'msg err'; msgEl.style.display = 'block'; return; }

    const handle = generateLinkHandle();
    document.getElementById('ql-create-btn').disabled = true;
    try {
      const r = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-product', password,
          handle, title, type: '', price: String(price),
          description: '', images: [], variants: [], unlisted: true,
        }),
      });
      const d = await r.json();
      if (d.error === 'Unauthorized') { password = ''; document.getElementById('main').style.display='none'; document.getElementById('login-screen').style.display='block'; document.getElementById('login-err').style.display='block'; return; }
      if (!d.ok) throw new Error(d.error || 'Failed');

      const url = 'https://lypspace.digital/product?h=' + handle;
      document.getElementById('ql-url').value = url;
      document.getElementById('ql-result').style.display = 'block';
      msgEl.textContent = 'Link created!';
      msgEl.className = 'msg ok';
      msgEl.style.display = 'block';

      const cr = await fetch(`/api/checkout?action=products&pw=${encodeURIComponent(password)}`);
      if (cr.ok) { const cd = await cr.json(); customProducts = cd.products || []; renderList(); }
    } catch (e) {
      msgEl.textContent = e.message;
      msgEl.className = 'msg err';
      msgEl.style.display = 'block';
    } finally {
      document.getElementById('ql-create-btn').disabled = false;
    }
  }

  function copyQuickLinkUrl() {
    const url = document.getElementById('ql-url').value;
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      const tip = document.getElementById('ql-copy-tip');
      tip.style.display = 'block';
      setTimeout(() => tip.style.display = 'none', 2000);
    });
  }
```

- [ ] **Step 4: Manual verification**

1. In `admin-products.html`, click "+ Quick Payment Link". Try submitting with an empty title — confirm the "Title is required" error shows and no request is sent.
2. Enter a title, leave price empty, submit — confirm "Enter a price greater than 0".
3. Enter a title and a valid price (e.g. 150), submit — confirm a success message and a Payment Link field appear with a URL like `https://lypspace.digital/product?h=link-<12 hex chars>`.
4. Click "Copy" — confirm the URL is copied (paste it somewhere to check) and the "Copied!" tip briefly appears.
5. Close the panel — confirm the new product appears in the main product list with "Custom" and "Unlisted" badges, and **not** an "Sold Out" badge (verifies the Task 2 stock sentinel).
6. Open the copied URL in an incognito window — confirm the product page loads, shows the right title/price, is not sold out, and "Buy Now" reaches Stripe checkout with the correct amount.
7. Complete a real or test-mode Stripe payment through that link — confirm shipping address collection works, and the order shows up in `admin-orders.html` afterward.
8. Go to `/catalog` — confirm the quick-link product does not appear there.
9. Repeat step 3 twice in a row — confirm two different random handles are generated (no collision in practice) and both links work independently.

- [ ] **Step 5: Commit and push**

```bash
git add admin-products.html
git commit -m "feat: add Quick Payment Link panel to admin product manager"
git push
```

---

## Post-implementation check

After all 5 tasks are done, do one end-to-end pass by hand:
1. Mark an existing custom product Unlisted — confirm it's gone from `/catalog` but its direct link still works and completes a purchase normally (discounts, shipping, `admin-orders.html` all behave exactly like a normal custom product).
2. Create a Quick Payment Link, copy it, open it in an incognito window, and complete a purchase — confirm it behaves identically to any other product (member discount/coupon stacking allowed, shipping collected, order visible in `admin-orders.html`).
3. Confirm neither the Hidden (Draft) checkbox's existing behavior nor any catalog-imported (`products.json`) product was affected by this work.
