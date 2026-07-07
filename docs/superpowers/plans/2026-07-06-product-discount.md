# Product Discount (Sale Price) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin set a discounted "sale price" per product in `admin-products.html`; the storefront then shows original price struck through + discount % + sale price, checkout charges the sale price, and a product-level discount never stacks with a coupon code or the 5% member discount.

**Architecture:** One new nullable column (`sale_price`) on the existing `product_overrides` and `custom_products` Supabase tables, read/written through the existing `/api/checkout.js` actions (`product-update`, `create-product`) — no new API file (Vercel Hobby 12-function limit is already maxed). The storefront (`catalog.html`, `product.html`) derives "on sale" and the discount percentage at render time from `price` vs `sale_price`; nothing is precomputed or stored. `checkout.html` and `api/checkout.js` both check whether any purchased handle is on sale and, if so, refuse to apply a promo code or member discount — client-side for UX, server-side as the actual enforcement.

**Tech Stack:** Vanilla JS (no framework), Vercel serverless functions (Node.js), Supabase (Postgres), Jest for backend tests (no frontend test runner exists in this project).

## Global Constraints

- Do not create a new file under `api/` — the project is at Vercel Hobby's 12-function limit. All backend changes go into the existing `api/checkout.js`.
- Do not touch the Stripe Express Checkout init timing or the in-app-browser banner logic in `js/cart.js` (lines ~239–272 and ~319–344) — these are frozen per user instruction. Only add the one additive field described in Task 6.
- Do not modify `#img-deck1`–`#img-deck4` positioning in `index.html` — unrelated to this feature, called out here only because it's a standing rule for this repo.
- `rip-curl-bikini.html` and `test-product.html` are out of scope — they're static pages with hardcoded prices and fixed Stripe Price IDs, not part of the `products.json`/`product_overrides`/`custom_products` system.
- Commit after every task (this repo auto-deploys on push to `main` — the user's stated preference is to push immediately rather than batching).

---

### Task 1: Add `sale_price` column to both Supabase tables

**Files:**
- None in the repo — this is a manual Supabase dashboard step (no local migration tooling exists in this project; confirmed no `supabase/migrations` folder or CLI config present).

**Interfaces:**
- Produces: a `sale_price numeric` column on `product_overrides` and on `custom_products`, both nullable, both selectable via the existing `select('*')` calls in `api/checkout.js` — every later task depends on these columns existing.

- [ ] **Step 1: Run the migration SQL**

Tell the user to open the Supabase project (nabpehsaifbgzezptyle) SQL editor and run:

```sql
alter table product_overrides add column if not exists sale_price numeric;
alter table custom_products add column if not exists sale_price numeric;
```

- [ ] **Step 2: Verify the columns exist**

Ask the user to confirm (or run, if you have Supabase access configured) the following check and confirm both queries return a row with `column_name = 'sale_price'`:

```sql
select column_name from information_schema.columns where table_name = 'product_overrides' and column_name = 'sale_price';
select column_name from information_schema.columns where table_name = 'custom_products' and column_name = 'sale_price';
```

- [ ] **Step 3: Commit**

Nothing to commit for this task (no repo files changed) — proceed to Task 2.

---

### Task 2: Backend — persist `sale_price` on `product-update` and `create-product`

**Files:**
- Modify: `api/checkout.js:128-140` (`product-update` action), `api/checkout.js:143-155` (`create-product` action)
- Test: `api/__tests__/checkout.test.js`

**Interfaces:**
- Consumes: nothing new from earlier tasks (Task 1 only adds DB columns).
- Produces: `product-update` and `create-product` now accept an optional `sale_price` field in the POST body and upsert it as `parseFloat(sale_price)` or `null` when empty. Later tasks (admin UI, storefront) rely on this field being present in the rows returned by `action=inventory` and `action=products`.

- [ ] **Step 1: Write the failing tests**

Add to `api/__tests__/checkout.test.js` (there's no existing `describe` block for `product-update`/`create-product` — add a new one near the end of the file, before the final closing of the file):

```js
describe('action=product-update', () => {
  function makeReq(body) { return { method: 'POST', body: { action: 'product-update', password: 'test-admin-pw', ...body } }; }

  beforeEach(() => { process.env.ADMIN_PASSWORD = 'test-admin-pw'; });
  afterEach(() => { delete process.env.ADMIN_PASSWORD; });

  test('saves sale_price when provided', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ upsert }) });
    const res = makeRes();
    await handler(makeReq({ handle: 'dress-21', sale_price: '56.00' }), res);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ handle: 'dress-21', sale_price: 56 }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('clears sale_price when empty string', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ upsert }) });
    const res = makeRes();
    await handler(makeReq({ handle: 'dress-21', sale_price: '' }), res);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ handle: 'dress-21', sale_price: null }));
  });

  test('omits sale_price from update when not provided', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ upsert }) });
    const res = makeRes();
    await handler(makeReq({ handle: 'dress-21', price: '80' }), res);
    expect(upsert).toHaveBeenCalledWith(expect.not.objectContaining({ sale_price: expect.anything() }));
  });
});

describe('action=create-product', () => {
  beforeEach(() => { process.env.ADMIN_PASSWORD = 'test-admin-pw'; });
  afterEach(() => { delete process.env.ADMIN_PASSWORD; });

  test('saves sale_price on a new custom product', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ upsert }) });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { action: 'create-product', password: 'test-admin-pw', handle: 'floral-set', title: 'Floral Set', price: '100', sale_price: '75' },
    }, res);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ handle: 'floral-set', price: 100, sale_price: 75 }));
  });

  test('sale_price defaults to null when omitted', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ upsert }) });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { action: 'create-product', password: 'test-admin-pw', handle: 'floral-set', title: 'Floral Set', price: '100' },
    }, res);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ sale_price: null }));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest checkout.test.js -t "product-update|create-product"`
Expected: FAIL — `sale_price` is not part of the upserted object yet (the three new `describe` blocks should fail on the `expect(upsert).toHaveBeenCalledWith(...)` assertions).

- [ ] **Step 3: Implement `product-update`**

In `api/checkout.js`, the current block (around line 128):

```js
  if (action === 'product-update') {
    const { password, handle, in_stock, price, description, variant_qtys } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    if (!handle) return res.status(400).json({ error: 'handle required' });
    const supabase = getSupabase();
    const update = { handle, updated_at: new Date().toISOString() };
    if (typeof in_stock === 'boolean') update.in_stock = in_stock;
    if (price !== undefined) update.price = price === '' ? null : parseFloat(price);
    if (description !== undefined) update.description = description;
    if (variant_qtys !== undefined) update.variant_qtys = variant_qtys;
    await supabase.from('product_overrides').upsert(update);
    return res.status(200).json({ ok: true });
  }
```

becomes:

```js
  if (action === 'product-update') {
    const { password, handle, in_stock, price, sale_price, description, variant_qtys } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    if (!handle) return res.status(400).json({ error: 'handle required' });
    const supabase = getSupabase();
    const update = { handle, updated_at: new Date().toISOString() };
    if (typeof in_stock === 'boolean') update.in_stock = in_stock;
    if (price !== undefined) update.price = price === '' ? null : parseFloat(price);
    if (sale_price !== undefined) update.sale_price = sale_price === '' ? null : parseFloat(sale_price);
    if (description !== undefined) update.description = description;
    if (variant_qtys !== undefined) update.variant_qtys = variant_qtys;
    await supabase.from('product_overrides').upsert(update);
    return res.status(200).json({ ok: true });
  }
```

- [ ] **Step 4: Implement `create-product`**

The current block (around line 143):

```js
  if (action === 'create-product') {
    const { password, handle, title, type, price, description, images, variants } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    if (!handle || !title) return res.status(400).json({ error: 'handle and title required' });
    const supabase = getSupabase();
    const total_qty = (variants || []).reduce((s, v) => s + (parseInt(v.qty) || 0), 0);
    await supabase.from('custom_products').upsert({
      handle, title, type: type || '', price: parseFloat(price) || 0,
      description: description || '', images: images || [], variants: variants || [],
      total_qty, created_at: new Date().toISOString()
    });
    return res.status(200).json({ ok: true });
  }
```

becomes:

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

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest checkout.test.js -t "product-update|create-product"`
Expected: PASS (all new tests green; run `npx jest checkout.test.js` with no filter afterward to confirm no regressions in the rest of the file).

- [ ] **Step 6: Commit and push**

```bash
git add api/checkout.js api/__tests__/checkout.test.js
git commit -m "feat: persist sale_price on product-update and create-product"
git push
```

---

### Task 3: Backend — server-side no-stacking enforcement in checkout session creation

**Files:**
- Modify: `api/checkout.js:280-348` (checkout session creation)
- Test: `api/__tests__/checkout.test.js`

**Interfaces:**
- Consumes: `product_overrides.sale_price` / `custom_products.sale_price` from Task 1/2.
- Produces: the checkout session request body accepts an optional top-level `handle` (single-item buy-now) and optional per-item `handle` inside `items[]` (cart checkout). When any resolved handle has an active `sale_price`, `params.discounts` is never set, regardless of `promotion_code_id` or member status. Task 8 (checkout.html) and Task 6 (cart.js / product.html) rely on this `handle` field name.

- [ ] **Step 1: Write the failing tests**

Add to `api/__tests__/checkout.test.js`, in a new `describe` block:

```js
describe('sale price blocks stacking with promo/member discount', () => {
  test('ignores promotion_code_id when the single item handle is on sale', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/sale1' });
    Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
    getSupabase.mockReturnValue({
      from: jest.fn((table) => ({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            data: table === 'product_overrides' ? [{ sale_price: 56 }] : [],
          }),
        }),
      })),
    });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { price_id: 'price_xxx', email: 'a@b.com', handle: 'dress-21', promotion_code_id: 'promo_yyy' },
    }, res);
    const call = mockCreate.mock.calls[0][0];
    expect(call.discounts).toBeUndefined();
  });

  test('ignores member discount when a cart item handle is on sale', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/sale2' });
    Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
    getSupabase.mockReturnValue({
      from: jest.fn((table) => {
        if (table === 'users') {
          return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { is_member: true } }) }) }) };
        }
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ data: table === 'custom_products' ? [{ sale_price: 20 }] : [] }),
          }),
        };
      }),
    });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: {
        email: 'member@b.com',
        items: [{ handle: 'floral-set', price_data: { name: 'Floral Set', amount: 20 }, quantity: 1 }],
      },
    }, res);
    const call = mockCreate.mock.calls[0][0];
    expect(call.discounts).toBeUndefined();
  });

  test('still applies promotion_code_id when nothing is on sale', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/nosale' });
    Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ in: jest.fn().mockResolvedValue({ data: [] }) }) }),
    });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { price_id: 'price_xxx', email: 'a@b.com', handle: 'dress-22', promotion_code_id: 'promo_yyy' },
    }, res);
    const call = mockCreate.mock.calls[0][0];
    expect(call.discounts).toEqual([{ promotion_code: 'promo_yyy' }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest checkout.test.js -t "blocks stacking"`
Expected: FAIL — today `params.discounts` is set unconditionally from `promotion_code_id`/member status, so the first two tests' `expect(call.discounts).toBeUndefined()` assertions fail.

- [ ] **Step 3: Implement the enforcement**

In `api/checkout.js`, just above `const params = {` (around line 313), add a handle-collection + sale lookup, then guard the existing discount block. The current code (lines ~313-348):

```js
  const params = {
    mode: 'payment',
    line_items,
    customer_email: email,
    success_url: `${process.env.SITE_URL}/dashboard?checkout=success`,
    cancel_url: `${process.env.SITE_URL}/checkout`,
    metadata: {
      coupon_code: normalizedCouponCode,
      shipping_name: shipping_name || '',
      shipping_street: shipping_street || '',
      shipping_city: shipping_city || '',
      shipping_state: shipping_state || '',
      shipping_postal_code: shipping_postal_code || '',
      shipping_country: shipping_country || '',
      shipping_phone: shipping_phone || '',
    },
  };

  if (promotion_code_id) {
    params.discounts = [{ promotion_code: promotion_code_id }];
  } else {
    const supabase = getSupabase();
    const { data: user } = await supabase.from('users').select('is_member').eq('email', email).maybeSingle();
    if (user && user.is_member) {
      const MEMBER_COUPON_ID = 'member-5pct-off';
      let memberCouponId;
      try {
        await stripe.coupons.retrieve(MEMBER_COUPON_ID);
        memberCouponId = MEMBER_COUPON_ID;
      } catch {
        const created = await stripe.coupons.create({ id: MEMBER_COUPON_ID, percent_off: 5, duration: 'once' });
        memberCouponId = created.id;
      }
      params.discounts = [{ coupon: memberCouponId }];
    }
  }

  const session = await stripe.checkout.sessions.create(params);
  return res.status(200).json({ url: session.url });
};
```

Replace the `if (promotion_code_id) { ... }` block (and everything through the final `};`) with:

```js
  const { handle: singleHandle } = req.body || {};
  const saleHandles = [
    ...(singleHandle ? [singleHandle] : []),
    ...((items || []).map(i => i.handle).filter(Boolean)),
  ];

  async function anyHandleOnSale(handles) {
    if (!handles.length) return false;
    const supabase = getSupabase();
    const [{ data: overrides }, { data: customs }] = await Promise.all([
      supabase.from('product_overrides').select('sale_price').in('handle', handles),
      supabase.from('custom_products').select('sale_price').in('handle', handles),
    ]);
    return [...(overrides || []), ...(customs || [])].some(r => r.sale_price != null && r.sale_price > 0);
  }

  const onSale = await anyHandleOnSale(saleHandles);

  if (!onSale && promotion_code_id) {
    params.discounts = [{ promotion_code: promotion_code_id }];
  } else if (!onSale) {
    const supabase = getSupabase();
    const { data: user } = await supabase.from('users').select('is_member').eq('email', email).maybeSingle();
    if (user && user.is_member) {
      const MEMBER_COUPON_ID = 'member-5pct-off';
      let memberCouponId;
      try {
        await stripe.coupons.retrieve(MEMBER_COUPON_ID);
        memberCouponId = MEMBER_COUPON_ID;
      } catch {
        const created = await stripe.coupons.create({ id: MEMBER_COUPON_ID, percent_off: 5, duration: 'once' });
        memberCouponId = created.id;
      }
      params.discounts = [{ coupon: memberCouponId }];
    }
  }

  const session = await stripe.checkout.sessions.create(params);
  return res.status(200).json({ url: session.url });
};
```

Note: `params` must still be declared before this new code, so leave the `const params = { ... };` block exactly where it is — only the code *after* it changes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest checkout.test.js`
Expected: PASS — every test in the file, including the pre-existing ones (e.g. `creates session without coupon`, `creates session with promotion code...`), since those don't pass a `handle`/`items[].handle` and `anyHandleOnSale([])` returns `false` without hitting Supabase.

- [ ] **Step 5: Commit and push**

```bash
git add api/checkout.js api/__tests__/checkout.test.js
git commit -m "feat: block promo/member discount stacking on sale-priced items"
git push
```

---

### Task 4: Admin UI — Sale Price field in `admin-products.html`

**Files:**
- Modify: `admin-products.html:148-151` (Price field area), `admin-products.html:277-304` (`productRow`), `admin-products.html:307-329` (`openCreate`), `admin-products.html:332-364` (`openEditOverride`), `admin-products.html:367-398` (`openEditCustom`), `admin-products.html:473-541` (`saveProduct`)

**Interfaces:**
- Consumes: `sale_price` field from Task 2's `product-update`/`create-product` actions and from the rows returned by `action=inventory`/`action=products` (already flow through automatically once the DB column exists).
- Produces: nothing new consumed by later tasks — Tasks 6/7 read `sale_price` directly from the same `/api/checkout?action=inventory` and `?action=products` responses this task doesn't change.

- [ ] **Step 1: Add the Sale Price field to the editor HTML**

In `admin-products.html`, right after the existing Price field (lines 148-151):

```html
    <div class="field">
      <label>Price (USD)</label>
      <input type="number" id="ed-price" step="0.01" min="0" placeholder="e.g. 89.00">
    </div>
```

insert:

```html
    <div class="field">
      <label>Sale Price (USD, optional)</label>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="number" id="ed-sale-price" step="0.01" min="0" placeholder="Leave blank for no discount" oninput="updateDiscountPreview()" style="flex:1">
        <span id="discount-pct-preview" style="font-size:12px;color:#1a7f37;white-space:nowrap;min-width:60px"></span>
        <button type="button" class="btn outline" style="flex-shrink:0" onclick="clearDiscount()">Clear Discount</button>
      </div>
    </div>
```

- [ ] **Step 2: Add `updateDiscountPreview()` and `clearDiscount()`**

Add these two functions right after the existing `getVariants()` function (after line 440, before the "Image preview" section comment):

```js
  function updateDiscountPreview() {
    const price = parseFloat(document.getElementById('ed-price').value) || 0;
    const salePrice = parseFloat(document.getElementById('ed-sale-price').value);
    const el = document.getElementById('discount-pct-preview');
    if (price > 0 && !isNaN(salePrice) && salePrice > 0 && salePrice < price) {
      el.textContent = Math.round((1 - salePrice / price) * 100) + '% OFF';
    } else {
      el.textContent = '';
    }
  }

  function clearDiscount() {
    document.getElementById('ed-sale-price').value = '';
    updateDiscountPreview();
  }
```

Also wire the preview to update when the Price field itself changes — add this line inside the existing `document.addEventListener('input', e => { ... })` handler that already exists for `ed-images` and `ed-handle` (around line 443-463); add a third `if`:

```js
  document.addEventListener('input', e => {
    if (e.target.id === 'ed-price') updateDiscountPreview();
  });
```

- [ ] **Step 3: Populate the field when opening the editor**

In `openCreate()` (around line 317, right after `document.getElementById('ed-price').value = '';`):

```js
    document.getElementById('ed-sale-price').value = '';
```

In `openEditOverride()` (around line 342, right after `document.getElementById('ed-price').value = ov.price != null ? ov.price : p.price;`):

```js
    document.getElementById('ed-sale-price').value = ov.sale_price != null ? ov.sale_price : '';
```

In `openEditCustom()` (around line 379, right after `document.getElementById('ed-price').value = p.price;`):

```js
    document.getElementById('ed-sale-price').value = p.sale_price != null ? p.sale_price : '';
```

In all three functions, call `updateDiscountPreview();` right after setting the value (add this one line after each of the three lines above).

- [ ] **Step 4: Include `sale_price` in the save payload**

In `saveProduct()`, the `edit-override` branch body (around line 485-491):

```js
        body = {
          action: 'product-update', password,
          handle: editingHandle,
          in_stock: editingInStock,
          price: document.getElementById('ed-price').value,
          description: document.getElementById('ed-desc').value,
        };
```

add `sale_price: document.getElementById('ed-sale-price').value,` after the `price:` line.

The custom-product branch body (around line 502-509):

```js
        body = {
          action: 'create-product', password,
          handle, title,
          type: document.getElementById('ed-type').value.trim(),
          price: document.getElementById('ed-price').value,
          description: document.getElementById('ed-desc').value,
          images, variants,
        };
```

add `sale_price: document.getElementById('ed-sale-price').value,` after the `price:` line.

- [ ] **Step 5: Show sale price in the product list row**

In `productRow()` (around line 277-292), the current price line:

```js
  function productRow(p) {
    const ov = overrides[p.handle] || {};
    const inStock = p._custom
      ? p.total_qty > 0
      : ('in_stock' in ov ? ov.in_stock : p.total_qty > 0);
    const price = p._custom ? p.price : (ov.price != null ? ov.price : p.price);
    const img = (p.images || [])[0] || '';
```

becomes:

```js
  function productRow(p) {
    const ov = overrides[p.handle] || {};
    const inStock = p._custom
      ? p.total_qty > 0
      : ('in_stock' in ov ? ov.in_stock : p.total_qty > 0);
    const price = p._custom ? p.price : (ov.price != null ? ov.price : p.price);
    const salePrice = p._custom ? p.sale_price : ov.sale_price;
    const onSale = salePrice != null && salePrice > 0 && salePrice < price;
    const img = (p.images || [])[0] || '';
```

and the price display line:

```js
        <p>${esc(p.type || '')} · $${Number(price).toFixed(2)}</p>
```

becomes:

```js
        <p>${esc(p.type || '')} · ${onSale ? `<s>$${Number(price).toFixed(2)}</s> $${Number(salePrice).toFixed(2)}` : '$' + Number(price).toFixed(2)}</p>
```

and add a badge — inside the `.badges` div (around line 293-297), after the custom/in-stock badges:

```js
          ${onSale ? '<span class="badge" style="background:#c00;color:#fff;border-color:#c00">On Sale</span>' : ''}
```

- [ ] **Step 6: Manual verification**

Run: `cd /Users/loren/Desktop/lypspace-clone && python3 -m http.server 8080` (or your usual local static server), then open `http://localhost:8080/admin-products.html`:
1. Log in, open any product's editor, type a Sale Price lower than the Price — confirm the "% OFF" preview appears next to the field and updates live as you type.
2. Type a Sale Price *higher* than Price — confirm the preview shows nothing (not a negative percentage).
3. Save, reopen the same product's editor — confirm the Sale Price field is pre-filled with the saved value.
4. Click "Clear Discount", save — confirm the product list row no longer shows the struck-through price / "On Sale" badge.
5. Repeat steps 1-4 for a custom product (one created via "+ Add Product").

- [ ] **Step 7: Commit and push**

```bash
git add admin-products.html
git commit -m "feat: add sale price field to admin product editor"
git push
```

---

### Task 5: `cart.js` — forward `handle` on cart items

**Files:**
- Modify: `js/cart.js:282-294` (`Cart.add`)

**Interfaces:**
- Consumes: nothing new.
- Produces: each stored cart item object now includes `handle` (may be `undefined` for the two legacy static-price-id products, which is fine — `Array.filter(Boolean)` in Task 3/8 already handles that). Task 8 reads `item.handle` from `Cart.getItems()`.

- [ ] **Step 1: Add `handle` to the stored item**

In `js/cart.js`, the current `add` function (line 282-294):

```js
    add: function (item) {
      var items = getItems();
      var key = item.price_id + '||' + item.name;
      var idx = items.findIndex(function (i) { return i._key === key; });
      if (idx >= 0) {
        items[idx].qty += (item.qty || 1);
      } else {
        items.push({ price_id: item.price_id, name: item.name, price: item.price, qty: item.qty || 1, _key: key });
      }
      setItems(items);
      openCart();
    },
```

change the `items.push(...)` line to:

```js
        items.push({ price_id: item.price_id, handle: item.handle, name: item.name, price: item.price, qty: item.qty || 1, _key: key });
```

This is the only change to this file — it does not touch `_initStripeExpress`, `_updateStripeAmount`, `_renderPayments`, or `_initInstagramBanner`.

- [ ] **Step 2: Manual verification**

1. Open any product page (e.g. `/product?h=dress-21`) in a browser with dev tools open.
2. Click "Add to Cart".
3. In the console, run `JSON.parse(localStorage.getItem('lypspace_cart'))` and confirm each item object now has a `handle` key matching the product's handle.
4. Open the cart sidebar and confirm it still renders name/price/qty and the +/− controls work exactly as before (this task must not change any visible cart behavior).

- [ ] **Step 3: Commit and push**

```bash
git add js/cart.js
git commit -m "feat: include product handle on cart items"
git push
```

---

### Task 6: `product.html` — apply sale price, render discount, scale variants, pass handle to checkout

**Files:**
- Modify: `product.html:209-229` (override application + `currentPrice`), `product.html:240-243` (`renderProduct` price line), `product.html:301-303` (price display element), `product.html:484-485` (`selectVariant` price update), `product.html:511-522` (`addToCart`), `product.html:542-547` (`buyNow`), `product.html` `<style>` block (near line 92, `.product-price`)

**Interfaces:**
- Consumes: `override.sale_price` (from `action=inventory`, Task 1/2) and `product.sale_price` (from `action=products`, for custom products, Task 1/2); `Cart.add({ handle, ... })` from Task 5.
- Produces: `currentPrice()` returns the discounted amount when on sale (consumed by `addToCart`/`buyNow`, which is what actually gets charged) — no other task depends on new product.html exports.

- [ ] **Step 1: Merge `sale_price` from the override / custom product record**

In `product.html`, right after the existing override merge block (around line 211-212):

```js
      if (override.price != null) product.price = override.price;
      if (override.description) product.description = override.description;
```

add, directly after `if (override.price != null) product.price = override.price;`:

```js
      product.sale_price = override.sale_price != null ? override.sale_price : (product.sale_price ?? null);
```

- [ ] **Step 2: Add discount helpers**

Right after `currentPrice()` (around line 226-229):

```js
    function currentPrice() {
      if (selectedVariant) return selectedVariant.price;
      return product.price;
    }
```

replace with:

```js
    function isOnSale() {
      return product.price > 0 && product.sale_price != null && product.sale_price > 0 && product.sale_price < product.price;
    }

    function discountPct() {
      return Math.round((1 - product.sale_price / product.price) * 100);
    }

    function currentPrice() {
      const base = selectedVariant ? selectedVariant.price : product.price;
      if (isOnSale()) return +(base * (product.sale_price / product.price)).toFixed(2);
      return base;
    }

    function priceDisplayHtml(base) {
      if (base <= 0) return 'Contact for price';
      if (!isOnSale()) return '$' + base.toFixed(2) + ' USD';
      const salePrice = +(base * (product.sale_price / product.price)).toFixed(2);
      return `<s class="price-original">$${base.toFixed(2)}</s> <span class="price-discount-pct">${discountPct()}% OFF</span> <span class="price-sale">$${salePrice.toFixed(2)} USD</span>`;
    }
```

`currentPrice()` keeps returning a plain number (used for the amount actually charged); `priceDisplayHtml(base)` is new and only used for rendering.

- [ ] **Step 3: Use `priceDisplayHtml` in `renderProduct()`**

The current line (around line 243):

```js
      const price = product.price > 0 ? '$' + product.price.toFixed(2) + ' USD' : 'Contact for price';
```

becomes:

```js
      const price = priceDisplayHtml(product.price);
```

(No other line in `renderProduct()` needs to change — `price` is already interpolated into the template at line 303 via `${price}`.)

- [ ] **Step 4: Render as HTML, not text**

The price element (around line 303) already reads `<p class="product-price" id="price-display">${price}</p>` inside a template literal assigned to `root.innerHTML` — no change needed there, since `price` now contains safe, code-generated markup (no user input) and `innerHTML` is already what's used for the whole `root` block.

- [ ] **Step 5: Update `selectVariant()` to use the same HTML**

The current line (around line 485):

```js
      document.getElementById('price-display').textContent = p > 0 ? '$' + p.toFixed(2) + ' USD' : 'Contact for price';
```

becomes:

```js
      const base = selectedVariant ? selectedVariant.price : product.price;
      document.getElementById('price-display').innerHTML = priceDisplayHtml(base);
```

(This replaces the existing `const p = currentPrice();` line right above it — keep `currentPrice()` available for `addToCart`/`buyNow`, just don't reuse its discounted return value for the struck-through display, since `priceDisplayHtml` needs the *pre-discount* variant price to compute both halves.)

So the full updated block (around line 484-485) is:

```js
      const base = selectedVariant ? selectedVariant.price : product.price;
      document.getElementById('price-display').innerHTML = priceDisplayHtml(base);
```

- [ ] **Step 6: Add `handle` to `addToCart()` and `buyNow()`**

`addToCart()` (line 511-522) already passes `handle: product.handle` to `Cart.add` — no change needed there (Task 5 already made `Cart.add` forward it).

`buyNow()` (line 542-547), current:

```js
    function buyNow() {
      if (!validateVariant()) return;
      const p = currentPrice();
      const name = encodeURIComponent(product.title + getVariantLabel());
      window.location.href = `/checkout?name=${name}&amount=${p}&qty=${qty}`;
    }
```

becomes:

```js
    function buyNow() {
      if (!validateVariant()) return;
      const p = currentPrice();
      const name = encodeURIComponent(product.title + getVariantLabel());
      window.location.href = `/checkout?name=${name}&amount=${p}&qty=${qty}&handle=${encodeURIComponent(product.handle)}`;
    }
```

- [ ] **Step 7: Add CSS for the new price spans**

In the `<style>` block, right after the existing `.product-price { font-size: 18px; margin-bottom: 32px; }` rule (around line 92):

```css
    .price-original { color: var(--gray); text-decoration: line-through; font-weight: 400; font-size: 14px; }
    .price-discount-pct { color: #c00; font-weight: 600; font-size: 14px; }
    .price-sale { font-weight: 600; }
```

- [ ] **Step 8: Manual verification**

1. In `admin-products.html`, set a sale price on a non-variant product (or the equivalent single-price product) and on a product with S/M/L variants.
2. Open `/product?h=<that-handle>` — confirm the price line shows `~~$126.00~~ 30% OFF $88.20` (struck-through original, percentage, sale price).
3. For the variant product, click through each size — confirm the displayed sale price updates and stays proportional to that variant's own price if it differs from the base.
4. Click "Add to Cart" — in devtools, confirm `localStorage.lypspace_cart` stores the *discounted* `price` and the correct `handle`.
5. Click "Buy Now" — confirm the URL includes `&handle=...` and the amount in the URL is the discounted price.
6. Set the sale price back to blank in the admin editor — confirm the product page reverts to a plain price with no strikethrough.

- [ ] **Step 9: Commit and push**

```bash
git add product.html
git commit -m "feat: show and charge sale price on product page"
git push
```

---

### Task 7: `catalog.html` — apply overrides and render discount on product cards

**Files:**
- Modify: `catalog.html:168-186` (`loadProducts`), `catalog.html:249-262` (`render`), `catalog.html` `<style>` block (near line 83, `.product-price`)

**Interfaces:**
- Consumes: `sale_price` from `action=inventory` (catalog products) and directly from `action=products` rows (custom products) — same data Task 6 consumes, independently applied here since `catalog.html` and `product.html` don't share state.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Apply `price`/`sale_price` overrides when loading the catalog**

`catalog.html` currently never applies `ov.price` at all on the catalog grid (a pre-existing gap — `inventoryMap` is only used for `isSoldOut`). Fix this as part of wiring in `sale_price`, since the discount can't display without it. Current `loadProducts()` (line 168-186):

```js
    async function loadProducts() {
      const [prodRes, invRes, customRes] = await Promise.all([
        fetch('/products.json'),
        fetch('/api/checkout?action=inventory').catch(() => null),
        fetch('/api/checkout?action=products' + (localStorage.getItem('lypspace_admin_pw') ? '&pw=' + encodeURIComponent(localStorage.getItem('lypspace_admin_pw')) : '')).catch(() => null)
      ]);
      allProducts = await prodRes.json();
      if (customRes && customRes.ok) {
        const cd = await customRes.json();
        const customs = (cd.products || []).map(p => ({ ...p, images: p.images || [], variants: p.variants || [], _custom: true }));
        allProducts = [...customs, ...allProducts];
      }
      if (invRes && invRes.ok) {
        const inv = await invRes.json();
        inventoryMap = inv.inventory || {};
      }
      buildFilters();
      render();
    }
```

becomes:

```js
    async function loadProducts() {
      const [prodRes, invRes, customRes] = await Promise.all([
        fetch('/products.json'),
        fetch('/api/checkout?action=inventory').catch(() => null),
        fetch('/api/checkout?action=products' + (localStorage.getItem('lypspace_admin_pw') ? '&pw=' + encodeURIComponent(localStorage.getItem('lypspace_admin_pw')) : '')).catch(() => null)
      ]);
      allProducts = await prodRes.json();
      if (customRes && customRes.ok) {
        const cd = await customRes.json();
        const customs = (cd.products || []).map(p => ({ ...p, images: p.images || [], variants: p.variants || [], _custom: true }));
        allProducts = [...customs, ...allProducts];
      }
      if (invRes && invRes.ok) {
        const inv = await invRes.json();
        inventoryMap = inv.inventory || {};
      }
      allProducts = allProducts.map(p => {
        const ov = inventoryMap[p.handle] || {};
        return {
          ...p,
          price: ov.price != null ? ov.price : p.price,
          sale_price: ov.sale_price != null ? ov.sale_price : (p.sale_price ?? null),
        };
      });
      buildFilters();
      render();
    }
```

- [ ] **Step 2: Render the discount on each card**

Current `render()` price line (line 249-262):

```js
      grid.innerHTML = pageProducts.map(p => {
        const img = p.images[0] || '';
        const price = p.price > 0 ? '$' + p.price.toFixed(2) : '';
        const soldOut = isSoldOut(p);
        return `<a href="/product?h=${p.handle}" class="product-card">
          <div class="product-image">
            ${img ? `<img src="${img}" alt="${esc(p.title)}" loading="lazy">` : ''}
            ${soldOut ? `<div class="sold-out-badge"><span>Sold Out</span></div>` : ''}
          </div>
          <p class="product-type">${esc(p.type || '')}</p>
          <p class="product-name">${esc(p.title)}</p>
          ${price ? `<p class="product-price">${soldOut ? '<s>' + price + '</s>' : price}</p>` : ''}
        </a>`;
      }).join('');
```

becomes:

```js
      grid.innerHTML = pageProducts.map(p => {
        const img = p.images[0] || '';
        const price = p.price > 0 ? '$' + p.price.toFixed(2) : '';
        const soldOut = isSoldOut(p);
        const onSale = p.price > 0 && p.sale_price != null && p.sale_price > 0 && p.sale_price < p.price;
        const pct = onSale ? Math.round((1 - p.sale_price / p.price) * 100) : 0;
        let priceHtml = '';
        if (price) {
          if (soldOut) {
            priceHtml = `<p class="product-price"><s>${price}</s></p>`;
          } else if (onSale) {
            priceHtml = `<p class="product-price"><s class="price-original">${price}</s> <span class="price-discount-pct">${pct}% OFF</span> <span class="price-sale">$${p.sale_price.toFixed(2)}</span></p>`;
          } else {
            priceHtml = `<p class="product-price">${price}</p>`;
          }
        }
        return `<a href="/product?h=${p.handle}" class="product-card">
          <div class="product-image">
            ${img ? `<img src="${img}" alt="${esc(p.title)}" loading="lazy">` : ''}
            ${soldOut ? `<div class="sold-out-badge"><span>Sold Out</span></div>` : ''}
          </div>
          <p class="product-type">${esc(p.type || '')}</p>
          <p class="product-name">${esc(p.title)}</p>
          ${priceHtml}
        </a>`;
      }).join('');
```

- [ ] **Step 3: Add CSS for the new price spans**

In the `<style>` block, right after the existing `.product-price { font-size: 13px; color: var(--gray); }` rule (around line 83):

```css
    .price-original { text-decoration: line-through; }
    .price-discount-pct { color: #c00; font-weight: 600; }
    .price-sale { color: var(--black); font-weight: 600; }
```

- [ ] **Step 4: Manual verification**

1. Set a sale price on a product via `admin-products.html`.
2. Open `/catalog` — confirm that product's card shows struck-through original price + "X% OFF" + sale price, and other (non-sale) cards are unaffected.
3. Set a product both sold-out and on-sale — confirm it still shows the sold-out badge and a plain struck-through price (no "% OFF" — sold-out takes visual priority per the design).
4. Confirm the catalog page's existing search/filter/pagination still work (this task changes `loadProducts`/`render`, both touched by every catalog interaction).

- [ ] **Step 5: Commit and push**

```bash
git add catalog.html
git commit -m "feat: show sale price and discount on catalog product cards"
git push
```

---

### Task 8: `checkout.html` — disable coupon/member discount when a purchased item is on sale

**Files:**
- Modify: `checkout.html:104-169` (setup/top of script), `checkout.html:176-201` (`checkMembership`), `checkout.html:262-281` (`startCheckout` body construction)

**Interfaces:**
- Consumes: `handle` query param (buy-now, from Task 6's `buyNow()`), `item.handle` from `Cart.getItems()` (cart checkout, from Task 5), `/api/checkout?action=inventory` (existing endpoint, now returns `sale_price` per Task 1/2).
- Produces: `handle` (single item) / `items[].handle` (cart) in the POST body sent to `/api/checkout` — this is what makes Task 3's `anyHandleOnSale` lookup possible; without this task's Step 3, Task 3's server-side check always sees an empty handle list and never blocks anything.

- [ ] **Step 1: Resolve the relevant handle(s) and check for an active sale**

Right after the existing `const handle = ...` — actually `checkout.html` doesn't yet have a `handle` const; add one near the top, right after the existing `const qty = ...` line (around line 110):

```js
    const singleHandle = params.get('handle');
```

Then, right after the existing membership/coupon state declarations (around line 174, after `let activeDiscount = null;`), add:

```js
    let hasSaleItem = false;

    async function checkForSaleItems() {
      const handles = isCart
        ? Cart.getItems().map(i => i.handle).filter(Boolean)
        : (singleHandle ? [singleHandle] : []);
      if (!handles.length) return;
      try {
        const r = await fetch('/api/checkout?action=inventory');
        if (!r.ok) return;
        const { inventory } = await r.json();
        hasSaleItem = handles.some(h => {
          const ov = inventory[h];
          return ov && ov.sale_price != null && ov.sale_price > 0;
        });
        if (hasSaleItem) {
          const couponInput = document.getElementById('coupon');
          const applyBtn = document.querySelector('.btn-apply');
          couponInput.disabled = true;
          applyBtn.disabled = true;
          couponInput.placeholder = 'Not available on sale items';
          const msgEl = document.getElementById('discount-msg');
          msgEl.textContent = 'Discount pricing — coupon codes and member discount don\'t apply to sale items.';
          msgEl.className = 'discount-msg';
        }
      } catch {
        // best-effort UX hint only — server enforces this regardless
      }
    }
    checkForSaleItems();
```

Note: for cart checkout, this only checks handles present *at page load*; since the cart's contents don't change while sitting on the checkout page (no add/remove UI here), this is sufficient — checking once on load matches how the rest of the page (product name/total) is already rendered once from `Cart.getItems()` at load time (lines 147-161).

- [ ] **Step 2: Skip the member-discount auto-check when a sale item is present**

Current `checkMembership()` (line 176-200):

```js
    async function checkMembership() {
      if (activeDiscount === 'coupon') return;
      const email = document.getElementById('email').value.trim();
```

becomes:

```js
    async function checkMembership() {
      if (activeDiscount === 'coupon' || hasSaleItem) return;
      const email = document.getElementById('email').value.trim();
```

- [ ] **Step 3: Forward the handle(s) into the actual checkout request body**

The UI-only check in Step 1 reads `handle` to disable the coupon field, but nothing yet sends that `handle` to `/api/checkout` — without this step, Task 3's server-side enforcement never receives a handle and `anyHandleOnSale([])` always returns `false`, silently defeating the whole point of having a server-side guarantee. Current `startCheckout()` body construction (around line 262-280):

```js
        const body = {
          email,
          shipping_name: shipName, shipping_street: shipStreet, shipping_city: shipCity,
          shipping_state: shipState, shipping_postal_code: shipPostal, shipping_country: shipCountry, shipping_phone: shipPhone,
        };
        if (isCart) {
          body.items = Cart.getItems().map(i =>
            i.price_id
              ? { price_id: i.price_id, quantity: i.qty }
              : { price_data: { name: i.name, amount: i.price }, quantity: i.qty }
          );
        } else if (isDynamic) {
          body.product_name = decodeURIComponent(productName);
          body.amount = amount;
          body.quantity = qty;
        } else {
          body.price_id = priceId;
          body.quantity = qty;
        }
        if (promoCodeId) { body.promotion_code_id = promoCodeId; body.coupon_code = appliedCouponCode; }
```

becomes:

```js
        const body = {
          email,
          shipping_name: shipName, shipping_street: shipStreet, shipping_city: shipCity,
          shipping_state: shipState, shipping_postal_code: shipPostal, shipping_country: shipCountry, shipping_phone: shipPhone,
        };
        if (isCart) {
          body.items = Cart.getItems().map(i =>
            i.price_id
              ? { price_id: i.price_id, handle: i.handle, quantity: i.qty }
              : { price_data: { name: i.name, amount: i.price }, handle: i.handle, quantity: i.qty }
          );
        } else if (isDynamic) {
          body.product_name = decodeURIComponent(productName);
          body.amount = amount;
          body.quantity = qty;
          if (singleHandle) body.handle = singleHandle;
        } else {
          body.price_id = priceId;
          body.quantity = qty;
          if (singleHandle) body.handle = singleHandle;
        }
        if (promoCodeId) { body.promotion_code_id = promoCodeId; body.coupon_code = appliedCouponCode; }
```

This matches what Task 3 reads: `req.body.handle` for the non-cart path, `items[].handle` for the cart path.

- [ ] **Step 4: Manual verification**

1. Set a sale price on a product in `admin-products.html`.
2. Buy-now flow: go to that product's page, click "Buy Now" — on `/checkout`, confirm the coupon input and Apply button are disabled with the "Not available on sale items" placeholder, and a message explains why.
3. On the same page, enter a known member email and blur the field — confirm no "✓ Member discount applied" message appears (since `checkMembership` now short-circuits).
4. Repeat for the cart flow: add the sale item to cart via "Add to Cart", go to `/checkout?cart=1` — confirm the same restriction applies.
5. Regression check: buy a *non*-sale product — confirm the coupon field is enabled and a member email still gets the "✓ Member discount applied — 5% off" message as before.
6. Regression check: apply a valid coupon code on a non-sale product — confirm it still works and the resulting Stripe session actually gets the discount (can verify via the Stripe dashboard or by checking `d.url` redirects successfully).
7. Open browser dev tools' Network tab, repeat step 2, and inspect the POST to `/api/checkout` — confirm the request body includes `handle` (buy-now) or `items[].handle` (cart), so the server-side check in Task 3 actually has something to look at.

- [ ] **Step 5: Commit and push**

```bash
git add checkout.html
git commit -m "feat: disable coupon/member discount UI when checkout includes a sale item"
git push
```

---

## Post-implementation check

After all 8 tasks are done, do one end-to-end pass by hand:
1. Set a sale price on one catalog product and one custom product.
2. Confirm both show correctly on `/catalog` and their `/product?h=...` pages.
3. Buy one of them via Buy Now with a coupon code entered — confirm checkout either blocks the coupon input (UI) and, if you inspect the created Stripe session (e.g. via Stripe dashboard), confirm no discount was applied and the amount charged equals the sale price.
4. Buy a non-sale product with a coupon code — confirm the coupon still applies (regression).
5. Clear the sale price on both products — confirm both pages and checkout revert to normal, undiscounted behavior.
