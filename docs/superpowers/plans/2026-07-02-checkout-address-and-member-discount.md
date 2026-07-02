# Checkout Address Collection, PayPal Order Recording & Member Discount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect a shipping address on both checkout payment paths (Stripe and PayPal), give PayPal orders a server-side record for the first time, and automatically apply a 5% discount for members on both payment paths with an on-page hint.

**Architecture:** All backend logic goes into the existing `api/checkout.js` (new `action` values: `check-member`, `record-paypal-order`, plus changes to the main Stripe-session-creation flow) and `api/webhook.js` (extended to persist address fields already established in this codebase). The `order_links` Supabase table gains nullable columns for shipping address and payment-provider identification. `checkout.html` gains an address form and membership-detection logic shared by both payment buttons.

**Tech Stack:** Vercel serverless functions (Node.js), `stripe` SDK, Supabase, vanilla HTML/JS (no framework), Jest with the existing `__mocks__/stripe.js` and `__mocks__/resend.js`.

## Global Constraints

- No new Supabase table — `order_links` is extended with new nullable columns.
- No new `api/*` file — all backend logic goes into the existing `api/checkout.js` and `api/webhook.js`.
- The 5% member discount is a hardcoded constant (`percent_off: 5`, coupon id `'member-5pct-off'`) — not admin-configurable.
- Member discount and a customer-entered promotion code are mutually exclusive: a promotion code, when present, always wins — the member discount is never applied on top of it.
- The server never trusts a client-supplied "is this a member" flag for pricing — `api/checkout.js` always re-looks-up `users.is_member` by the submitted email at the point of charging.
- Address fields are validated only for "non-empty" — no per-country format validation.
- New address labels/messages on `checkout.html` are plain English text, not wired into the existing 6-language `data-i18n` system (that system's translation files are out of scope for this plan).

## Non-Goals / Follow-Up Required Later

Displaying the new shipping address fields in the admin refund panel (`GET /api/admin/coupon?resource=orders`, being built on the sibling `worktree-admin-refunds` branch) is **not** part of this plan. That endpoint currently does not exist on `main`; once both this branch and the refund branch are merged, whoever does that follow-up work must also make sure the `resource=orders` handler filters or handles rows where `stripe_session_id` is `null` (PayPal-paid orders) before calling `stripe.checkout.sessions.retrieve` on them, since that call requires a real Stripe session ID and will throw on `null`.

---

### Task 1: `check-member` action + Supabase test mocking

**Files:**
- Modify: `api/checkout.js`
- Test: `api/__tests__/checkout.test.js`

**Interfaces:**
- Produces: `POST /api/checkout` body `{ action: 'check-member', email }` → `200 { is_member: boolean }`. `400 { error: 'email required' }` if `email` missing. Unknown/not-found email → `is_member: false`, not an error.
- Produces (for later tasks in this plan): a `getSupabase` mock now available in `api/__tests__/checkout.test.js`, defaulted in `beforeEach` to `is_member: false` so every pre-existing test keeps passing unchanged after Task 2 adds a member-discount lookup to the main checkout flow.

- [ ] **Step 1: Write the failing tests**

Replace the top of `api/__tests__/checkout.test.js` (everything before `test('returns 405 for non-POST'...)`) with:

```js
jest.mock('stripe');
jest.mock('../_lib/supabase', () => ({ getSupabase: jest.fn() }));
let Stripe, handler, getSupabase;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
  process.env.SITE_URL = 'https://example.com';
  Stripe = require('stripe');
  getSupabase = require('../_lib/supabase').getSupabase;
  getSupabase.mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: { is_member: false } }),
        }),
      }),
    }),
  });
  handler = require('../checkout');
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.SITE_URL;
});

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn(), end: jest.fn() });
```

Then add this `describe` block anywhere after the existing tests (e.g. at the end of the file):

```js
describe('action=check-member', () => {
  test('returns 400 when email missing', async () => {
    Stripe.mockReturnValue({});
    const res = makeRes();
    await handler({ method: 'POST', body: { action: 'check-member' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'email required' });
  });

  test('returns is_member true for a member', async () => {
    Stripe.mockReturnValue({});
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: { is_member: true } }),
          }),
        }),
      }),
    });
    const res = makeRes();
    await handler({ method: 'POST', body: { action: 'check-member', email: 'member@test.com' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ is_member: true });
  });

  test('returns is_member false for a non-member', async () => {
    Stripe.mockReturnValue({});
    const res = makeRes();
    await handler({ method: 'POST', body: { action: 'check-member', email: 'nonmember@test.com' } }, res);
    expect(res.json).toHaveBeenCalledWith({ is_member: false });
  });

  test('returns is_member false when email not found', async () => {
    Stripe.mockReturnValue({});
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
    });
    const res = makeRes();
    await handler({ method: 'POST', body: { action: 'check-member', email: 'nobody@test.com' } }, res);
    expect(res.json).toHaveBeenCalledWith({ is_member: false });
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx jest api/__tests__/checkout.test.js -t "check-member"`
Expected: FAIL — `action: 'check-member'` isn't handled yet, so the request falls through to `email required` (from the main flow) or a different error.

- [ ] **Step 3: Implement the action**

In `api/checkout.js`, insert this new block immediately after the closing `}` of the existing `if (action === 'validate') { ... }` block (i.e. right before the line `const { price_id, email, items, promotion_code_id, coupon_code, quantity, amount, product_name } = req.body || {};`):

```js
  if (action === 'check-member') {
    const { email: checkEmail } = req.body || {};
    if (!checkEmail) return res.status(400).json({ error: 'email required' });
    const supabase = getSupabase();
    const { data: user } = await supabase
      .from('users')
      .select('is_member')
      .eq('email', checkEmail)
      .maybeSingle();
    return res.status(200).json({ is_member: !!(user && user.is_member) });
  }

```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest api/__tests__/checkout.test.js`
Expected: PASS — all tests in the file, including the pre-existing ones (the `getSupabase` default mock from Step 1 keeps them working unchanged).

- [ ] **Step 5: Commit**

```bash
git add api/checkout.js api/__tests__/checkout.test.js
git commit -m "Add check-member action to api/checkout.js"
```

---

### Task 2: Member discount coupon application in the Stripe session flow

**Files:**
- Modify: `api/checkout.js`
- Test: `api/__tests__/checkout.test.js`

**Interfaces:**
- Consumes: the `getSupabase` mock and default (`is_member: false`) set up in Task 1.
- Produces: when creating a Stripe Checkout Session, if the submitted `email` belongs to a member (server-side lookup) and no `promotion_code_id` is present in the request, `params.discounts` is set to `[{ coupon: 'member-5pct-off' }]`. If `promotion_code_id` is present, member-discount logic is skipped entirely (no Supabase lookup happens).

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `api/__tests__/checkout.test.js` (after the `check-member` block added in Task 1):

```js
describe('member discount', () => {
  test('applies member coupon when email belongs to a member and no promo code given', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/member' });
    const mockRetrieve = jest.fn().mockResolvedValue({ id: 'member-5pct-off' });
    Stripe.mockReturnValue({
      checkout: { sessions: { create: mockCreate } },
      coupons: { retrieve: mockRetrieve, create: jest.fn() },
    });
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: { is_member: true } }),
          }),
        }),
      }),
    });
    const res = makeRes();
    await handler({ method: 'POST', body: { price_id: 'price_xxx', email: 'member@test.com' } }, res);
    expect(mockRetrieve).toHaveBeenCalledWith('member-5pct-off');
    const call = mockCreate.mock.calls[0][0];
    expect(call.discounts).toEqual([{ coupon: 'member-5pct-off' }]);
  });

  test('creates the member coupon when it does not exist yet', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/member2' });
    const mockCouponRetrieve = jest.fn().mockRejectedValue(new Error('No such coupon'));
    const mockCouponCreate = jest.fn().mockResolvedValue({ id: 'member-5pct-off' });
    Stripe.mockReturnValue({
      checkout: { sessions: { create: mockCreate } },
      coupons: { retrieve: mockCouponRetrieve, create: mockCouponCreate },
    });
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: { is_member: true } }),
          }),
        }),
      }),
    });
    const res = makeRes();
    await handler({ method: 'POST', body: { price_id: 'price_xxx', email: 'member@test.com' } }, res);
    expect(mockCouponCreate).toHaveBeenCalledWith({ id: 'member-5pct-off', percent_off: 5, duration: 'once' });
    const call = mockCreate.mock.calls[0][0];
    expect(call.discounts).toEqual([{ coupon: 'member-5pct-off' }]);
  });

  test('does not apply member coupon for a non-member', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/nonmember' });
    Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
    const res = makeRes();
    await handler({ method: 'POST', body: { price_id: 'price_xxx', email: 'nonmember@test.com' } }, res);
    const call = mockCreate.mock.calls[0][0];
    expect(call.discounts).toBeUndefined();
  });

  test('promotion code takes priority over member discount and skips the membership lookup', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/promo' });
    Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { price_id: 'price_xxx', email: 'member@test.com', promotion_code_id: 'promo_yyy' },
    }, res);
    expect(getSupabase).not.toHaveBeenCalled();
    const call = mockCreate.mock.calls[0][0];
    expect(call.discounts).toEqual([{ promotion_code: 'promo_yyy' }]);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx jest api/__tests__/checkout.test.js -t "member discount"`
Expected: FAIL — member-discount logic doesn't exist yet, so `call.discounts` is `undefined` in the member-coupon tests, and the "promotion code takes priority" test currently passes already (existing behavior) but the others fail.

- [ ] **Step 3: Implement the member discount logic**

In `api/checkout.js`, replace:

```js
  if (promotion_code_id) {
    params.discounts = [{ promotion_code: promotion_code_id }];
  }

  const session = await stripe.checkout.sessions.create(params);
  return res.status(200).json({ url: session.url });
```

with:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest api/__tests__/checkout.test.js`
Expected: PASS — all tests, including the pre-existing ones (they don't set `promotion_code_id` or a member email, so they hit the `else` branch, get `is_member: false` from the Task 1 default mock, and `params.discounts` stays `undefined` exactly as before).

- [ ] **Step 5: Commit**

```bash
git add api/checkout.js api/__tests__/checkout.test.js
git commit -m "Apply automatic 5% member discount when no promotion code is used"
```

---

### Task 3: `order_links` schema + shipping address metadata round-trip

**Files:**
- Modify: `api/checkout.js`
- Modify: `api/webhook.js`
- Test: `api/__tests__/checkout.test.js`
- Test: `api/__tests__/webhook.test.js`
- Manual: Supabase SQL Editor migration (see Step 3)

**Interfaces:**
- Produces: `POST /api/checkout` (main session-creation flow) now reads `shipping_name`, `shipping_street`, `shipping_city`, `shipping_state`, `shipping_postal_code`, `shipping_country`, `shipping_phone` from the request body and writes them into `session.metadata` (empty string if not provided).
- Produces: `api/webhook.js`'s `checkout.session.completed` handler reads those same keys back off `session.metadata` and includes them (plus `payment_provider: 'stripe'`) in the `order_links` upsert.
- Consumes (later, Task 4): the new `order_links` columns this task creates via the manual SQL migration.

- [ ] **Step 1: Write the failing checkout.js test**

Add this test to `api/__tests__/checkout.test.js` (after the `member discount` describe block):

```js
test('includes shipping address fields in session metadata', async () => {
  const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/addr' });
  Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
  const res = makeRes();
  await handler({
    method: 'POST',
    body: {
      price_id: 'price_xxx', email: 'a@b.com',
      shipping_name: 'Jane Doe', shipping_street: '123 Main St', shipping_city: 'Springfield',
      shipping_state: 'IL', shipping_postal_code: '62701', shipping_country: 'US', shipping_phone: '555-1234',
    },
  }, res);
  const call = mockCreate.mock.calls[0][0];
  expect(call.metadata).toEqual({
    coupon_code: '',
    shipping_name: 'Jane Doe', shipping_street: '123 Main St', shipping_city: 'Springfield',
    shipping_state: 'IL', shipping_postal_code: '62701', shipping_country: 'US', shipping_phone: '555-1234',
  });
});
```

Then update the two pre-existing tests whose exact `metadata` assertion will now be missing the new (empty) shipping keys. Change:

```js
  expect(call.metadata).toEqual({ coupon_code: '' });
```

(in `test('creates session without coupon'...)`) to:

```js
  expect(call.metadata).toEqual({
    coupon_code: '',
    shipping_name: '', shipping_street: '', shipping_city: '',
    shipping_state: '', shipping_postal_code: '', shipping_country: '', shipping_phone: '',
  });
```

And change:

```js
  expect(call.metadata).toEqual({ coupon_code: 'SAVE10' });
```

(in `test('creates session with promotion code...'`) to:

```js
  expect(call.metadata).toEqual({
    coupon_code: 'SAVE10',
    shipping_name: '', shipping_street: '', shipping_city: '',
    shipping_state: '', shipping_postal_code: '', shipping_country: '', shipping_phone: '',
  });
```

- [ ] **Step 2: Run tests to verify the new/changed ones fail**

Run: `npx jest api/__tests__/checkout.test.js -t "metadata"`
Expected: FAIL — `metadata` currently only ever contains `coupon_code`.

- [ ] **Step 3: Implement the checkout.js metadata capture**

In `api/checkout.js`, change:

```js
  const { price_id, email, items, promotion_code_id, coupon_code, quantity, amount, product_name } = req.body || {};
```

to:

```js
  const {
    price_id, email, items, promotion_code_id, coupon_code, quantity, amount, product_name,
    shipping_name, shipping_street, shipping_city, shipping_state, shipping_postal_code, shipping_country, shipping_phone,
  } = req.body || {};
```

And change:

```js
  const params = {
    mode: 'payment',
    line_items,
    customer_email: email,
    success_url: `${process.env.SITE_URL}/dashboard?checkout=success`,
    cancel_url: `${process.env.SITE_URL}/checkout`,
    metadata: { coupon_code: normalizedCouponCode },
  };
```

to:

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
```

- [ ] **Step 4: Run the checkout.js tests to verify they pass**

Run: `npx jest api/__tests__/checkout.test.js`
Expected: PASS — all tests.

- [ ] **Step 5: Write the failing webhook.js test**

Add this test to `api/__tests__/webhook.test.js` (after the existing tests):

```js
test('writes shipping address fields from session metadata into order_links', async () => {
  const session = {
    id: 'cs_addr_test',
    metadata: {
      shipping_name: 'Jane Doe',
      shipping_street: '123 Main St',
      shipping_city: 'Springfield',
      shipping_state: 'IL',
      shipping_postal_code: '62701',
      shipping_country: 'US',
      shipping_phone: '555-1234',
    },
    customer_details: { email: 'buyer@test.com', name: 'Jane Doe' },
    amount_total: 5000,
    currency: 'usd',
  };
  mockConstructEvent.mockReturnValue({
    type: 'checkout.session.completed',
    data: { object: session },
  });
  const { getSupabase } = require('../_lib/supabase');
  const mockUpsert = jest.fn().mockResolvedValue({});
  const mockFrom = jest.fn().mockReturnValue({ upsert: mockUpsert });
  getSupabase.mockReturnValue({ from: mockFrom });

  await handler(makeReq(JSON.stringify(session)), makeRes());

  expect(mockUpsert).toHaveBeenCalledWith(
    expect.objectContaining({
      stripe_session_id: 'cs_addr_test',
      payment_provider: 'stripe',
      shipping_name: 'Jane Doe',
      shipping_street: '123 Main St',
      shipping_city: 'Springfield',
      shipping_state: 'IL',
      shipping_postal_code: '62701',
      shipping_country: 'US',
      shipping_phone: '555-1234',
    }),
    { onConflict: 'stripe_session_id' }
  );
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest api/__tests__/webhook.test.js -t "shipping address"`
Expected: FAIL — `order_links` upsert currently only includes `stripe_session_id`, `user_id`, `customer_email`.

- [ ] **Step 7: Implement the webhook.js persistence**

In `api/webhook.js`, replace:

```js
    const supabase = getSupabase();
    const userId = session.metadata?.userId || null;
    try {
      await supabase.from('order_links').upsert(
        { stripe_session_id: session.id, user_id: userId, customer_email: customerEmail },
        { onConflict: 'stripe_session_id' }
      );
    } catch (err) {
      console.error('[webhook] order_links upsert failed — MANUAL RECOVERY NEEDED', {
        stripe_session_id: session.id,
        user_id: userId,
        customer_email: customerEmail,
        error: err.message,
      });
    }
```

with:

```js
    const supabase = getSupabase();
    const userId = session.metadata?.userId || null;
    const meta = session.metadata || {};
    try {
      await supabase.from('order_links').upsert(
        {
          stripe_session_id: session.id,
          user_id: userId,
          customer_email: customerEmail,
          payment_provider: 'stripe',
          shipping_name: meta.shipping_name || null,
          shipping_street: meta.shipping_street || null,
          shipping_city: meta.shipping_city || null,
          shipping_state: meta.shipping_state || null,
          shipping_postal_code: meta.shipping_postal_code || null,
          shipping_country: meta.shipping_country || null,
          shipping_phone: meta.shipping_phone || null,
        },
        { onConflict: 'stripe_session_id' }
      );
    } catch (err) {
      console.error('[webhook] order_links upsert failed — MANUAL RECOVERY NEEDED', {
        stripe_session_id: session.id,
        user_id: userId,
        customer_email: customerEmail,
        error: err.message,
      });
    }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest api/__tests__/webhook.test.js`
Expected: PASS — all tests, including the pre-existing `writes to order_links on checkout.session.completed` test (it uses `expect.objectContaining`, so the extra fields don't break it).

- [ ] **Step 9: Run the Supabase migration manually**

This is a manual step against the live Supabase project (`nabpehsaifbgzezptyle`) — open its SQL Editor and run:

```sql
alter table public.order_links
  add column if not exists shipping_name text,
  add column if not exists shipping_street text,
  add column if not exists shipping_city text,
  add column if not exists shipping_state text,
  add column if not exists shipping_postal_code text,
  add column if not exists shipping_country text,
  add column if not exists shipping_phone text,
  add column if not exists payment_provider text,
  add column if not exists paypal_order_id text;

alter table public.order_links alter column stripe_session_id drop not null;
```

This is safe to run whether or not `stripe_session_id` currently has a `NOT NULL` constraint — dropping a constraint that isn't there is a no-op in Postgres.

- [ ] **Step 10: Commit**

```bash
git add api/checkout.js api/webhook.js api/__tests__/checkout.test.js api/__tests__/webhook.test.js
git commit -m "Round-trip shipping address through session metadata into order_links"
```

---

### Task 4: `record-paypal-order` action

**Files:**
- Modify: `api/checkout.js`
- Test: `api/__tests__/checkout.test.js`

**Interfaces:**
- Consumes: the `order_links` schema (including `payment_provider`, `paypal_order_id`, and `shipping_*` columns) created in Task 3's manual migration.
- Produces: `POST /api/checkout` body `{ action: 'record-paypal-order', email, paypal_order_id, amount, shipping_name, shipping_street, shipping_city, shipping_state, shipping_postal_code, shipping_country, shipping_phone }` → `200 { recorded: true }`. `400 { error: 'email, paypal_order_id, and amount required' }` if any of `email`/`paypal_order_id`/`amount` is missing. `amount` is required for validation but is not persisted to any column (the `order_links` schema from Task 3 has no amount column — this matches the spec, which lists it as an input but not among the written fields). A Supabase insert failure does not change the `200` response (the PayPal payment has already been captured and can't be undone from this endpoint) but is logged via `console.error` for manual recovery, mirroring the existing `[webhook] order_links upsert failed` pattern in `api/webhook.js`.

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `api/__tests__/checkout.test.js`:

```js
describe('action=record-paypal-order', () => {
  test('returns 400 when required fields are missing', async () => {
    Stripe.mockReturnValue({});
    const res = makeRes();
    await handler({ method: 'POST', body: { action: 'record-paypal-order', email: 'a@b.com' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'email, paypal_order_id, and amount required' });
  });

  test('inserts a paypal order_links row with address fields', async () => {
    Stripe.mockReturnValue({});
    const mockInsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ insert: mockInsert }) });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: {
        action: 'record-paypal-order',
        email: 'buyer@test.com',
        paypal_order_id: 'PAYPAL123',
        amount: '47.50',
        shipping_name: 'Jane Doe', shipping_street: '123 Main St', shipping_city: 'Springfield',
        shipping_state: 'IL', shipping_postal_code: '62701', shipping_country: 'US', shipping_phone: '555-1234',
      },
    }, res);
    expect(mockInsert).toHaveBeenCalledWith({
      paypal_order_id: 'PAYPAL123',
      payment_provider: 'paypal',
      customer_email: 'buyer@test.com',
      shipping_name: 'Jane Doe', shipping_street: '123 Main St', shipping_city: 'Springfield',
      shipping_state: 'IL', shipping_postal_code: '62701', shipping_country: 'US', shipping_phone: '555-1234',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ recorded: true });
  });

  test('still returns success when the Supabase insert fails', async () => {
    Stripe.mockReturnValue({});
    const mockInsert = jest.fn().mockRejectedValue(new Error('insert failed'));
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ insert: mockInsert }) });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { action: 'record-paypal-order', email: 'buyer@test.com', paypal_order_id: 'PAYPAL456', amount: '10.00' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ recorded: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest api/__tests__/checkout.test.js -t "record-paypal-order"`
Expected: FAIL — `action: 'record-paypal-order'` isn't handled yet.

- [ ] **Step 3: Implement the action**

In `api/checkout.js`, insert this new block immediately after the `check-member` block added in Task 1 (and still before the line destructuring `price_id, email, items, ...` for the main flow):

```js
  if (action === 'record-paypal-order') {
    const {
      email: paypalEmail, paypal_order_id, amount: paypalAmount,
      shipping_name, shipping_street, shipping_city, shipping_state, shipping_postal_code, shipping_country, shipping_phone,
    } = req.body || {};
    if (!paypalEmail || !paypal_order_id || paypalAmount == null)
      return res.status(400).json({ error: 'email, paypal_order_id, and amount required' });

    const supabase = getSupabase();
    try {
      await supabase.from('order_links').insert({
        paypal_order_id,
        payment_provider: 'paypal',
        customer_email: paypalEmail,
        shipping_name: shipping_name || null,
        shipping_street: shipping_street || null,
        shipping_city: shipping_city || null,
        shipping_state: shipping_state || null,
        shipping_postal_code: shipping_postal_code || null,
        shipping_country: shipping_country || null,
        shipping_phone: shipping_phone || null,
      });
    } catch (err) {
      console.error('[checkout] record-paypal-order insert failed — MANUAL RECOVERY NEEDED', {
        paypal_order_id, customer_email: paypalEmail, error: err.message,
      });
    }
    return res.status(200).json({ recorded: true });
  }

```

Note the test for the missing-fields case above passes `shipping_name: shipping_name || null` etc. — in the "missing required fields" test, `getSupabase` is never called, so no need to worry about the mock chain for that case; only the success and insert-failure tests configure `getSupabase.mockReturnValue`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest api/__tests__/checkout.test.js`
Expected: PASS — all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add api/checkout.js api/__tests__/checkout.test.js
git commit -m "Add record-paypal-order action so PayPal orders get a server-side record"
```

---

### Task 5: Address form on `checkout.html` + Stripe path wiring

**Files:**
- Modify: `checkout.html`

**Interfaces:**
- Produces: seven new input elements (`#ship-name`, `#ship-street`, `#ship-city`, `#ship-state`, `#ship-postal`, `#ship-country`, `#ship-phone`) that Task 6 and Task 7 both read from.
- Consumes: none from earlier tasks (this is the first frontend task); its output (the form fields and the `shipping_*` keys it now sends in `startCheckout()`'s request body) is consumed by Task 3's backend metadata capture (already implemented) and by Task 7's PayPal wiring.

There is no frontend test runner in this project (`package.json`'s `jest.testMatch` only covers `api/__tests__/**`), so this task is verified manually.

- [ ] **Step 1: Add the address form markup**

In `checkout.html`, insert the following immediately after the email `<div class="group">...</div>` block (i.e. right after the line `</div>` that closes the email group, before the `<div class="group">` that starts the discount-code section):

```html
    <div class="group">
      <label for="ship-name">Full name</label>
      <input id="ship-name" type="text" placeholder="Jane Doe">
    </div>

    <div class="group">
      <label for="ship-street">Street address</label>
      <input id="ship-street" type="text" placeholder="123 Main St">
    </div>

    <div class="group">
      <label for="ship-city">City</label>
      <input id="ship-city" type="text" placeholder="Springfield">
    </div>

    <div class="group">
      <label for="ship-state">State / Province</label>
      <input id="ship-state" type="text" placeholder="IL">
    </div>

    <div class="group">
      <label for="ship-postal">Postal code</label>
      <input id="ship-postal" type="text" placeholder="62701">
    </div>

    <div class="group">
      <label for="ship-country">Country</label>
      <select id="ship-country"></select>
    </div>

    <div class="group">
      <label for="ship-phone">Phone</label>
      <input id="ship-phone" type="text" placeholder="+1 555 123 4567">
    </div>
```

- [ ] **Step 2: Add the country list and populate the dropdown**

In `checkout.html`, in the first `<script>` block, right after the line `const btn = document.getElementById('checkout-btn');`, add:

```js
    const COUNTRIES = [
      'Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda','Argentina','Armenia',
      'Australia','Austria','Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium',
      'Belize','Benin','Bhutan','Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria',
      'Burkina Faso','Burundi','Cabo Verde','Cambodia','Cameroon','Canada','Central African Republic','Chad',
      'Chile','China','Colombia','Comoros','Congo (Congo-Brazzaville)','Costa Rica','Croatia','Cuba','Cyprus',
      'Czechia','Democratic Republic of the Congo','Denmark','Djibouti','Dominica','Dominican Republic',
      'Ecuador','Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia','Eswatini','Ethiopia','Fiji',
      'Finland','France','Gabon','Gambia','Georgia','Germany','Ghana','Greece','Grenada','Guatemala','Guinea',
      'Guinea-Bissau','Guyana','Haiti','Honduras','Hong Kong','Hungary','Iceland','India','Indonesia','Iran',
      'Iraq','Ireland','Israel','Italy','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kiribati','Kuwait',
      'Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania',
      'Luxembourg','Macau','Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Marshall Islands',
      'Mauritania','Mauritius','Mexico','Micronesia','Moldova','Monaco','Mongolia','Montenegro','Morocco',
      'Mozambique','Myanmar','Namibia','Nauru','Nepal','Netherlands','New Zealand','Nicaragua','Niger',
      'Nigeria','North Korea','North Macedonia','Norway','Oman','Pakistan','Palau','Palestine','Panama',
      'Papua New Guinea','Paraguay','Peru','Philippines','Poland','Portugal','Qatar','Romania','Russia',
      'Rwanda','Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines','Samoa','San Marino',
      'Sao Tome and Principe','Saudi Arabia','Senegal','Serbia','Seychelles','Sierra Leone','Singapore',
      'Slovakia','Slovenia','Solomon Islands','Somalia','South Africa','South Korea','South Sudan','Spain',
      'Sri Lanka','Sudan','Suriname','Sweden','Switzerland','Syria','Taiwan','Tajikistan','Tanzania',
      'Thailand','Timor-Leste','Togo','Tonga','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan',
      'Tuvalu','Uganda','Ukraine','United Arab Emirates','United Kingdom','United States','Uruguay',
      'Uzbekistan','Vanuatu','Vatican City','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
    ];
    const countrySelect = document.getElementById('ship-country');
    countrySelect.innerHTML = '<option value="">Select country</option>' +
      COUNTRIES.map(c => '<option value="' + c + '">' + c + '</option>').join('');
```

- [ ] **Step 3: Require the address fields before checkout and send them to the backend**

In `checkout.html`, replace the `startCheckout()` function:

```js
    async function startCheckout() {
      const email = document.getElementById('email').value.trim();
      if (!email) { alert(tr('co_email_req')); return; }
      if (!isCart && !priceId && !isDynamic) return;
      btn.disabled = true;
      btn.textContent = tr('co_redirecting');
      try {
        const body = { email };
```

with:

```js
    async function startCheckout() {
      const email = document.getElementById('email').value.trim();
      const shipName = document.getElementById('ship-name').value.trim();
      const shipStreet = document.getElementById('ship-street').value.trim();
      const shipCity = document.getElementById('ship-city').value.trim();
      const shipState = document.getElementById('ship-state').value.trim();
      const shipPostal = document.getElementById('ship-postal').value.trim();
      const shipCountry = document.getElementById('ship-country').value;
      const shipPhone = document.getElementById('ship-phone').value.trim();
      if (!email) { alert(tr('co_email_req')); return; }
      if (!shipName || !shipStreet || !shipCity || !shipState || !shipPostal || !shipCountry || !shipPhone) {
        alert('Please fill in your shipping address.');
        return;
      }
      if (!isCart && !priceId && !isDynamic) return;
      btn.disabled = true;
      btn.textContent = tr('co_redirecting');
      try {
        const body = {
          email,
          shipping_name: shipName, shipping_street: shipStreet, shipping_city: shipCity,
          shipping_state: shipState, shipping_postal_code: shipPostal, shipping_country: shipCountry, shipping_phone: shipPhone,
        };
```

(The rest of `startCheckout()` — the `if (isCart) { ... } else if (isDynamic) { ... } else { ... }` block that adds `items`/`product_name`+`amount`/`price_id` to `body`, and everything after it — is unchanged; this replacement only touches the function's opening lines through the `const body = {` initialization.)

- [ ] **Step 4: Manually verify**

Run: `vercel dev` from `/Users/loren/Desktop/lypspace-clone/.claude/worktrees/address-collection`, open `http://localhost:3000/checkout?price_id=price_1SfHnN4IZcEaiWjkyJz96vJX&name=Test&qty=1` and confirm:
1. The country dropdown is populated and alphabetized-looking (matches the array order).
2. Clicking "Proceed to Payment" without filling the address fields shows the "Please fill in your shipping address." alert and does not navigate away.
3. Filling in the address and clicking "Proceed to Payment" redirects to a real Stripe Checkout page (test mode).

Expected: all three behaviors match.

- [ ] **Step 5: Commit**

```bash
git add checkout.html
git commit -m "Add shipping address form to checkout.html and wire it into the Stripe path"
```

---

### Task 6: Member discount detection & display on `checkout.html`

**Files:**
- Modify: `checkout.html`

**Interfaces:**
- Consumes: `POST /api/checkout` `{ action: 'check-member', email }` from Task 1.
- Produces: a page-level `activeDiscount` variable (`null` | `'coupon'` | `'member'`) that Task 7 reads to decide whether to discount the PayPal amount.

- [ ] **Step 1: Add the `activeDiscount` state and membership check**

In `checkout.html`, right after the line `let appliedCouponCode = null;`, add:

```js
    let activeDiscount = null; // null | 'coupon' | 'member'

    async function checkMembership() {
      if (activeDiscount === 'coupon') return;
      const email = document.getElementById('email').value.trim();
      const msgEl = document.getElementById('discount-msg');
      if (!email) return;
      try {
        const r = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check-member', email }),
        });
        const d = await r.json();
        if (d.is_member) {
          activeDiscount = 'member';
          msgEl.textContent = '✓ Member discount applied — 5% off';
          msgEl.className = 'discount-msg ok';
        } else if (activeDiscount === 'member') {
          activeDiscount = null;
          msgEl.textContent = '';
          msgEl.className = 'discount-msg';
        }
      } catch {
        // membership hint is a nice-to-have — a failed check should not block checkout
      }
    }
    document.getElementById('email').addEventListener('blur', checkMembership);
```

- [ ] **Step 2: Coordinate `activeDiscount` with the existing coupon-apply flow**

In `checkout.html`'s `applyCode()` function, replace:

```js
        if (d.valid) {
          promoCodeId = d.promotion_code_id;
          appliedCouponCode = code.toUpperCase();
          msgEl.textContent = '✓ ' + d.message;
          msgEl.className = 'discount-msg ok';
        } else {
          promoCodeId = null;
          appliedCouponCode = null;
          msgEl.textContent = d.error || 'Invalid discount code';
          msgEl.className = 'discount-msg err';
        }
```

with:

```js
        if (d.valid) {
          promoCodeId = d.promotion_code_id;
          appliedCouponCode = code.toUpperCase();
          activeDiscount = 'coupon';
          msgEl.textContent = '✓ ' + d.message;
          msgEl.className = 'discount-msg ok';
        } else {
          promoCodeId = null;
          appliedCouponCode = null;
          if (activeDiscount === 'coupon') activeDiscount = null;
          msgEl.textContent = d.error || 'Invalid discount code';
          msgEl.className = 'discount-msg err';
        }
```

- [ ] **Step 3: Manually verify**

Run: `vercel dev` from `/Users/loren/Desktop/lypspace-clone/.claude/worktrees/address-collection`, open `/checkout?price_id=price_1SfHnN4IZcEaiWjkyJz96vJX&name=Test&qty=1`, and confirm:
1. Typing a known member's email and tabbing out of the field shows `✓ Member discount applied — 5% off`.
2. Typing a non-member email and tabbing out shows no message (or clears a previously-shown member message).
3. After the member message appears, applying a valid coupon code replaces it with the coupon's own message.
4. After a coupon is applied, changing the email to a different member's email does **not** overwrite the coupon message.

Expected: all four behaviors match. (Use the existing `/admin` member-management panel to mark a test account as a member if you don't already have one.)

- [ ] **Step 4: Commit**

```bash
git add checkout.html
git commit -m "Detect and display the member discount on checkout.html"
```

---

### Task 7: PayPal path — discounted amount, address validation, and order recording

**Files:**
- Modify: `checkout.html`

**Interfaces:**
- Consumes: `activeDiscount` from Task 6, the `#ship-*` fields from Task 5, and `POST /api/checkout` `{ action: 'record-paypal-order', ... }` from Task 4.
- Produces: nothing consumed elsewhere — this is the last task in the plan.

- [ ] **Step 1: Apply the member discount to the PayPal amount**

In `checkout.html`, replace:

```js
      function getPayPalAmount() {
        if (isCart) {
          return Cart.total().toFixed(2);
        }
        const a = parseFloat(params.get('amount') || '0');
        return (a * qty).toFixed(2);
      }
```

with:

```js
      function getPayPalAmount() {
        const base = isCart ? Cart.total() : parseFloat(params.get('amount') || '0') * qty;
        const discounted = activeDiscount === 'member' ? base * 0.95 : base;
        return discounted.toFixed(2);
      }
```

- [ ] **Step 2: Require the address fields before creating a PayPal order**

In `checkout.html`, replace the `createOrder` function inside the `paypal_sdk.Buttons({...})` call:

```js
        createOrder: function(data, actions) {
          const email = document.getElementById('email').value.trim();
          if (!email) { alert(tr('co_email_req')); return Promise.reject(); }
          const amount = getPayPalAmount();
          if (parseFloat(amount) <= 0) return Promise.reject();
          return actions.order.create({
            purchase_units: [{ amount: { value: amount, currency_code: 'USD' } }],
            application_context: { shipping_preference: 'NO_SHIPPING' },
          });
        },
```

with:

```js
        createOrder: function(data, actions) {
          const email = document.getElementById('email').value.trim();
          if (!email) { alert(tr('co_email_req')); return Promise.reject(); }
          const shipName = document.getElementById('ship-name').value.trim();
          const shipStreet = document.getElementById('ship-street').value.trim();
          const shipCity = document.getElementById('ship-city').value.trim();
          const shipState = document.getElementById('ship-state').value.trim();
          const shipPostal = document.getElementById('ship-postal').value.trim();
          const shipCountry = document.getElementById('ship-country').value;
          const shipPhone = document.getElementById('ship-phone').value.trim();
          if (!shipName || !shipStreet || !shipCity || !shipState || !shipPostal || !shipCountry || !shipPhone) {
            alert('Please fill in your shipping address.');
            return Promise.reject();
          }
          const amount = getPayPalAmount();
          if (parseFloat(amount) <= 0) return Promise.reject();
          return actions.order.create({
            purchase_units: [{ amount: { value: amount, currency_code: 'USD' } }],
            application_context: { shipping_preference: 'NO_SHIPPING' },
          });
        },
```

- [ ] **Step 3: Record the order after PayPal capture succeeds**

In `checkout.html`, replace the `onApprove` function:

```js
        onApprove: function(data, actions) {
          return actions.order.capture().then(function(details) {
            if (isCart) Cart.clear();
            const name = details.payer.name.given_name || '';
            alert('Payment successful! Thank you' + (name ? ', ' + name : '') + '.');
            location.href = '/?paypal=success';
          });
        },
```

with:

```js
        onApprove: function(data, actions) {
          return actions.order.capture().then(function(details) {
            if (isCart) Cart.clear();
            const email = document.getElementById('email').value.trim();
            const capture = details.purchase_units?.[0]?.payments?.captures?.[0];
            const capturedAmount = capture ? capture.amount.value : getPayPalAmount();
            fetch('/api/checkout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'record-paypal-order',
                email,
                paypal_order_id: details.id,
                amount: capturedAmount,
                shipping_name: document.getElementById('ship-name').value.trim(),
                shipping_street: document.getElementById('ship-street').value.trim(),
                shipping_city: document.getElementById('ship-city').value.trim(),
                shipping_state: document.getElementById('ship-state').value.trim(),
                shipping_postal_code: document.getElementById('ship-postal').value.trim(),
                shipping_country: document.getElementById('ship-country').value,
                shipping_phone: document.getElementById('ship-phone').value.trim(),
              }),
            }).catch(function(err) { console.error('Failed to record PayPal order', err); });
            const name = details.payer.name.given_name || '';
            alert('Payment successful! Thank you' + (name ? ', ' + name : '') + '.');
            location.href = '/?paypal=success';
          });
        },
```

- [ ] **Step 4: Manually verify**

Run: `vercel dev` from `/Users/loren/Desktop/lypspace-clone/.claude/worktrees/address-collection`, open `/checkout?price_id=...` (or a cart checkout), and using PayPal sandbox credentials confirm:
1. Without filling the address, clicking the PayPal button shows the "Please fill in your shipping address." alert and no PayPal popup opens.
2. With a member email entered (triggering the Task 6 message) and the address filled in, the PayPal button charges 95% of the expected total (check the PayPal sandbox popup's displayed amount).
3. After a successful sandbox payment, check the Supabase `order_links` table directly (via the Supabase dashboard Table Editor) and confirm a new row exists with `payment_provider = 'paypal'`, the correct `paypal_order_id`, and the shipping fields filled in.

Expected: all three behaviors match.

- [ ] **Step 5: Commit**

```bash
git add checkout.html
git commit -m "Apply member discount and record order on the PayPal path"
```
