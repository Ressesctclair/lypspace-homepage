# Admin Refunds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin look up a customer's orders by email and issue full or partial Stripe refunds (to the original payment method) from `/admin`, without adding a new serverless function.

**Architecture:** All new logic is added to the existing `api/admin/coupon.js` file, dispatched by a `resource` query param (`orders` / `refund`), the same convention `api/user/orders.js` already uses for `resource=addresses`. The existing coupon list/create/deactivate behavior in that file is untouched. A new "退款管理" section is added to `admin.html` following the visual/JS pattern of the existing 发货通知 and 折扣券管理 sections.

**Tech Stack:** Vercel serverless functions (Node.js), `stripe` SDK, `resend` for email, Jest for tests (existing `__mocks__/stripe.js` and `__mocks__/resend.js`).

## Global Constraints

- No new file under `api/` may be created — the Vercel Hobby plan's 12-function limit is already at capacity. All new backend logic goes into `api/admin/coupon.js`.
- Refund email must be in **English** (the existing order-confirmation email in `api/webhook.js` is in Chinese — do not copy that language).
- Admin auth is the existing `password === process.env.ADMIN_PASSWORD` check used by every other `api/admin/*` endpoint — do not introduce a different auth mechanism.
- No new Supabase table — refund status is read live from Stripe (`charge.amount_refunded` / `charge.refunded`), not stored anywhere.
- Follow the existing code style in `api/admin/coupon.js` and `admin.html` exactly (inline styles, `escHtml`, `confirm()` before destructive actions, etc.) — do not introduce a CSS framework, a bundler, or restructure unrelated code.

---

### Task 1: Order lookup by email with live Stripe refund status

**Files:**
- Modify: `api/admin/coupon.js`
- Test: `api/__tests__/admin/coupon.test.js`

**Interfaces:**
- Produces: `GET /api/admin/coupon?resource=orders&password=<pw>&email=<email>` → `200 { orders: [{ session_id, date, amount, currency, refund_status: 'none'|'partial'|'full', amount_refunded }] }`, sorted newest first. `401` on bad password, `400` if `email` missing.
- Consumes: `getSupabase` from `../_lib/supabase` (already used elsewhere in the project, e.g. `api/user/orders.js`), the `order_links` table (`stripe_session_id`, `customer_email` columns — same table `api/user/orders.js` already queries), and `stripe.checkout.sessions.retrieve` with `expand: ['payment_intent.latest_charge']`.

- [ ] **Step 1: Write the failing tests**

Open `api/__tests__/admin/coupon.test.js`. Replace the top of the file (everything before the first `// --- GET (list) ---` comment) with:

```js
jest.mock('stripe');
jest.mock('../../_lib/supabase', () => ({ getSupabase: jest.fn() }));
let Stripe, handler, getSupabase;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.ADMIN_PASSWORD = 'admin-secret';
  process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
  Stripe = require('stripe');
  getSupabase = require('../../_lib/supabase').getSupabase;
  handler = require('../../admin/coupon');
});

afterEach(() => {
  delete process.env.ADMIN_PASSWORD;
  delete process.env.STRIPE_SECRET_KEY;
});

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn(), end: jest.fn() });
```

(This just adds the `getSupabase` mock/require to the existing setup — the rest of the file, including `makeRes`, stays where it is. Delete the old standalone `const makeRes = ...` line further down if replacing this block leaves a duplicate.)

Then add this new `describe` block anywhere after the existing tests (e.g. at the end of the file, before the final closing of the file):

```js
describe('GET resource=orders', () => {
  test('returns 401 for wrong password', async () => {
    Stripe.mockReturnValue({});
    const res = makeRes();
    await handler({ method: 'GET', query: { resource: 'orders', password: 'wrong', email: 'a@b.com' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 400 when email missing', async () => {
    Stripe.mockReturnValue({});
    const res = makeRes();
    await handler({ method: 'GET', query: { resource: 'orders', password: 'admin-secret' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'email required' });
  });

  test('returns empty array when customer has no orders', async () => {
    Stripe.mockReturnValue({});
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [] }),
        }),
      }),
    });
    const res = makeRes();
    await handler({ method: 'GET', query: { resource: 'orders', password: 'admin-secret', email: 'a@b.com' } }, res);
    expect(res.json).toHaveBeenCalledWith({ orders: [] });
  });

  test('returns orders with refund_status "none" when nothing refunded', async () => {
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [{ stripe_session_id: 'cs_1' }] }),
        }),
      }),
    });
    const mockRetrieve = jest.fn().mockResolvedValue({
      created: 1700000000,
      amount_total: 12600,
      currency: 'usd',
      payment_intent: { latest_charge: { amount_refunded: 0, refunded: false } },
    });
    Stripe.mockReturnValue({ checkout: { sessions: { retrieve: mockRetrieve } } });
    const res = makeRes();
    await handler({ method: 'GET', query: { resource: 'orders', password: 'admin-secret', email: 'a@b.com' } }, res);
    expect(mockRetrieve).toHaveBeenCalledWith('cs_1', { expand: ['payment_intent.latest_charge'] });
    expect(res.json).toHaveBeenCalledWith({
      orders: [expect.objectContaining({ session_id: 'cs_1', amount: 12600, refund_status: 'none', amount_refunded: 0 })],
    });
  });

  test('returns refund_status "partial" when some but not all was refunded', async () => {
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [{ stripe_session_id: 'cs_2' }] }),
        }),
      }),
    });
    Stripe.mockReturnValue({
      checkout: {
        sessions: {
          retrieve: jest.fn().mockResolvedValue({
            created: 1700000000,
            amount_total: 20000,
            currency: 'usd',
            payment_intent: { latest_charge: { amount_refunded: 5000, refunded: false } },
          }),
        },
      },
    });
    const res = makeRes();
    await handler({ method: 'GET', query: { resource: 'orders', password: 'admin-secret', email: 'a@b.com' } }, res);
    expect(res.json).toHaveBeenCalledWith({
      orders: [expect.objectContaining({ refund_status: 'partial', amount_refunded: 5000 })],
    });
  });

  test('returns refund_status "full" when charge.refunded is true', async () => {
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [{ stripe_session_id: 'cs_3' }] }),
        }),
      }),
    });
    Stripe.mockReturnValue({
      checkout: {
        sessions: {
          retrieve: jest.fn().mockResolvedValue({
            created: 1700000000,
            amount_total: 8900,
            currency: 'usd',
            payment_intent: { latest_charge: { amount_refunded: 8900, refunded: true } },
          }),
        },
      },
    });
    const res = makeRes();
    await handler({ method: 'GET', query: { resource: 'orders', password: 'admin-secret', email: 'a@b.com' } }, res);
    expect(res.json).toHaveBeenCalledWith({
      orders: [expect.objectContaining({ refund_status: 'full', amount_refunded: 8900 })],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx jest api/__tests__/admin/coupon.test.js -t "resource=orders"`
Expected: FAIL — `handler` doesn't recognize `resource: 'orders'` yet, so it falls into the existing coupon-list branch and the assertions on `orders` fail (or `getSupabase`/`from` is never called).

- [ ] **Step 3: Implement the orders lookup**

In `api/admin/coupon.js`, replace the top of the file:

```js
const Stripe = require('stripe');
```

with:

```js
const Stripe = require('stripe');
const { getSupabase } = require('../_lib/supabase');
```

Then, inside `module.exports = async (req, res) => { const stripe = Stripe(process.env.STRIPE_SECRET_KEY);` and *before* the existing `if (req.method === 'GET') {` block, insert:

```js
  if (req.method === 'GET' && req.query?.resource === 'orders') {
    const { password, email } = req.query || {};
    if (password !== process.env.ADMIN_PASSWORD)
      return res.status(401).json({ error: 'Unauthorized' });
    if (!email)
      return res.status(400).json({ error: 'email required' });

    const supabase = getSupabase();
    const { data: links } = await supabase
      .from('order_links')
      .select('stripe_session_id')
      .eq('customer_email', email);
    const sessionIds = [...new Set((links || []).map((r) => r.stripe_session_id))];
    if (sessionIds.length === 0) return res.status(200).json({ orders: [] });

    const orders = await Promise.all(
      sessionIds.map(async (stripe_session_id) => {
        const session = await stripe.checkout.sessions.retrieve(stripe_session_id, {
          expand: ['payment_intent.latest_charge'],
        });
        const charge = session.payment_intent?.latest_charge;
        const amountRefunded = charge?.amount_refunded || 0;
        const refundStatus = !amountRefunded ? 'none' : charge?.refunded ? 'full' : 'partial';
        return {
          session_id: stripe_session_id,
          date: new Date(session.created * 1000).toISOString(),
          amount: session.amount_total,
          currency: session.currency,
          refund_status: refundStatus,
          amount_refunded: amountRefunded,
        };
      })
    );
    orders.sort((a, b) => new Date(b.date) - new Date(a.date));
    return res.status(200).json({ orders });
  }

```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest api/__tests__/admin/coupon.test.js`
Expected: PASS — all tests in the file, including the pre-existing coupon tests (unchanged) and the new `resource=orders` tests.

- [ ] **Step 5: Commit**

```bash
git add api/admin/coupon.js api/__tests__/admin/coupon.test.js
git commit -m "Add admin order lookup by email with live Stripe refund status"
```

---

### Task 2: Full/partial refund action with English confirmation email

**Files:**
- Modify: `api/admin/coupon.js`
- Test: `api/__tests__/admin/coupon.test.js`

**Interfaces:**
- Produces: `POST /api/admin/coupon?resource=refund` body `{ password, session_id, amount? }` → `200 { refunded: true, refund_id, amount, status }` on success (amount in cents, as returned by Stripe). `401` bad password, `400` missing `session_id`, `400 { error: <stripe message> }` when Stripe rejects the refund (over-refund, already refunded, etc.).
- Consumes: `session_id` values produced by Task 1's `orders` list (`session.session_id`). Uses `stripe.checkout.sessions.retrieve`, `stripe.refunds.create`, and `resend`'s `Resend` client (same package already used in `api/webhook.js`).

- [ ] **Step 1: Write the failing tests**

In `api/__tests__/admin/coupon.test.js`, update the top-of-file setup block (from Task 1) to also mock `resend`:

```js
jest.mock('stripe');
jest.mock('resend');
jest.mock('../../_lib/supabase', () => ({ getSupabase: jest.fn() }));
let Stripe, Resend, handler, getSupabase;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.ADMIN_PASSWORD = 'admin-secret';
  process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
  process.env.RESEND_API_KEY = 're_test_xxx';
  Stripe = require('stripe');
  ({ Resend } = require('resend'));
  getSupabase = require('../../_lib/supabase').getSupabase;
  handler = require('../../admin/coupon');
});

afterEach(() => {
  delete process.env.ADMIN_PASSWORD;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.RESEND_API_KEY;
});

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn(), end: jest.fn() });
```

Then add this `describe` block after the `describe('GET resource=orders', ...)` block added in Task 1:

```js
describe('POST resource=refund', () => {
  test('returns 401 for wrong password', async () => {
    Stripe.mockReturnValue({});
    const res = makeRes();
    await handler({ method: 'POST', query: { resource: 'refund' }, body: { password: 'wrong', session_id: 'cs_1' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 400 when session_id missing', async () => {
    Stripe.mockReturnValue({});
    const res = makeRes();
    await handler({ method: 'POST', query: { resource: 'refund' }, body: { password: 'admin-secret' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'session_id required' });
  });

  test('issues a full refund when amount is omitted, and emails the customer in English', async () => {
    const mockRetrieve = jest.fn().mockResolvedValue({
      payment_intent: 'pi_123',
      customer_details: { email: 'buyer@test.com' },
    });
    const mockRefundCreate = jest.fn().mockResolvedValue({ id: 're_1', amount: 12600, currency: 'usd', status: 'succeeded' });
    const mockEmailSend = jest.fn().mockResolvedValue({});
    Resend.mockImplementation(() => ({ emails: { send: mockEmailSend } }));
    Stripe.mockReturnValue({
      checkout: { sessions: { retrieve: mockRetrieve } },
      refunds: { create: mockRefundCreate },
    });
    const res = makeRes();
    await handler({ method: 'POST', query: { resource: 'refund' }, body: { password: 'admin-secret', session_id: 'cs_1' } }, res);
    expect(mockRefundCreate).toHaveBeenCalledWith({ payment_intent: 'pi_123' });
    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'buyer@test.com', subject: 'Refund Confirmation - LYP SPACE' })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ refunded: true, refund_id: 're_1', amount: 12600, status: 'succeeded' });
  });

  test('issues a partial refund, converting dollars to cents', async () => {
    const mockRetrieve = jest.fn().mockResolvedValue({ payment_intent: 'pi_456', customer_details: { email: 'buyer@test.com' } });
    const mockRefundCreate = jest.fn().mockResolvedValue({ id: 're_2', amount: 5000, currency: 'usd', status: 'succeeded' });
    Resend.mockImplementation(() => ({ emails: { send: jest.fn().mockResolvedValue({}) } }));
    Stripe.mockReturnValue({
      checkout: { sessions: { retrieve: mockRetrieve } },
      refunds: { create: mockRefundCreate },
    });
    const res = makeRes();
    await handler({ method: 'POST', query: { resource: 'refund' }, body: { password: 'admin-secret', session_id: 'cs_1', amount: 50 } }, res);
    expect(mockRefundCreate).toHaveBeenCalledWith({ payment_intent: 'pi_456', amount: 5000 });
  });

  test('surfaces the Stripe error message when the refund is rejected', async () => {
    const mockRetrieve = jest.fn().mockResolvedValue({ payment_intent: 'pi_789', customer_details: { email: 'buyer@test.com' } });
    const mockRefundCreate = jest.fn().mockRejectedValue(new Error('Refund amount is greater than unrefunded amount'));
    Stripe.mockReturnValue({
      checkout: { sessions: { retrieve: mockRetrieve } },
      refunds: { create: mockRefundCreate },
    });
    const res = makeRes();
    await handler({ method: 'POST', query: { resource: 'refund' }, body: { password: 'admin-secret', session_id: 'cs_1', amount: 999 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Refund amount is greater than unrefunded amount' });
  });

  test('still returns success when the confirmation email fails to send', async () => {
    const mockRetrieve = jest.fn().mockResolvedValue({ payment_intent: 'pi_999', customer_details: { email: 'buyer@test.com' } });
    const mockRefundCreate = jest.fn().mockResolvedValue({ id: 're_3', amount: 12600, currency: 'usd', status: 'succeeded' });
    Resend.mockImplementation(() => ({ emails: { send: jest.fn().mockRejectedValue(new Error('send failed')) } }));
    Stripe.mockReturnValue({
      checkout: { sessions: { retrieve: mockRetrieve } },
      refunds: { create: mockRefundCreate },
    });
    const res = makeRes();
    await handler({ method: 'POST', query: { resource: 'refund' }, body: { password: 'admin-secret', session_id: 'cs_1' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ refunded: true }));
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx jest api/__tests__/admin/coupon.test.js -t "resource=refund"`
Expected: FAIL — `resource: 'refund'` isn't handled yet, so requests fall through to `405` or the unrelated coupon POST branch.

- [ ] **Step 3: Implement the refund action**

In `api/admin/coupon.js`, update the top of the file to:

```js
const Stripe = require('stripe');
const { Resend } = require('resend');
const { getSupabase } = require('../_lib/supabase');

const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';

const escHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
```

Then, immediately after the `resource === 'orders'` block added in Task 1 (and still before the existing `if (req.method === 'GET') {` coupon-list block), insert:

```js
  if (req.method === 'POST' && req.query?.resource === 'refund') {
    const { password, session_id, amount } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD)
      return res.status(401).json({ error: 'Unauthorized' });
    if (!session_id)
      return res.status(400).json({ error: 'session_id required' });

    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      if (!paymentIntentId)
        return res.status(400).json({ error: 'no payment found for this session' });

      const refundParams = { payment_intent: paymentIntentId };
      if (amount != null) refundParams.amount = Math.round(Number(amount) * 100);

      const refund = await stripe.refunds.create(refundParams);

      const customerEmail = session.customer_details?.email;
      if (customerEmail) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: FROM_EMAIL,
            to: customerEmail,
            subject: 'Refund Confirmation - LYP SPACE',
            html: `
              <div style="font-family:Helvetica Neue,Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;padding:40px 0;">
                <h2 style="font-weight:400;letter-spacing:0.04em;margin-bottom:24px;">Your refund has been processed</h2>
                <p style="margin-bottom:16px;">Hello,</p>
                <p style="margin-bottom:24px;">We've processed a refund for your order. It should appear on your original payment method within 5-10 business days.</p>
                <table style="width:100%;border-collapse:collapse;margin:24px 0;border-top:1px solid #e0e0e0;">
                  <tr>
                    <td style="padding:12px 0;color:#6b6b6b;border-bottom:1px solid #e0e0e0;">Order ID</td>
                    <td style="padding:12px 0;border-bottom:1px solid #e0e0e0;">${escHtml(session_id)}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0;color:#6b6b6b;">Refund Amount</td>
                    <td style="padding:12px 0;">${escHtml((refund.amount / 100).toFixed(2))} ${escHtml((refund.currency || 'usd').toUpperCase())}</td>
                  </tr>
                </table>
                <p style="color:#6b6b6b;font-size:12px;border-top:1px solid #e0e0e0;padding-top:24px;">LYP SPACE</p>
              </div>
            `,
          });
        } catch (err) {
          console.error('Failed to send refund confirmation email:', err.message);
        }
      }

      return res.status(200).json({
        refunded: true,
        refund_id: refund.id,
        amount: refund.amount,
        status: refund.status,
      });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'refund failed' });
    }
  }

```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest api/__tests__/admin/coupon.test.js`
Expected: PASS — every test in the file, including Task 1's and the pre-existing coupon tests.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx jest`
Expected: PASS — no other test file imports or depends on `api/admin/coupon.js`'s internals, so this should be unaffected.

- [ ] **Step 6: Commit**

```bash
git add api/admin/coupon.js api/__tests__/admin/coupon.test.js
git commit -m "Add admin refund action (full/partial) with English confirmation email"
```

---

### Task 3: "退款管理" admin UI

**Files:**
- Modify: `admin.html`

**Interfaces:**
- Consumes: `GET /api/admin/coupon?resource=orders&password=<pw>&email=<email>` and `POST /api/admin/coupon?resource=refund` from Tasks 1–2. Reuses the global `escHtml(s)` JS function already defined in the 折扣券管理 section's `<script>` block (this section's script runs later in the page, so `escHtml` is already defined by the time it's called).
- Produces: nothing consumed elsewhere — this is the last piece of the feature.

There is no frontend test runner in this project (`package.json`'s `jest.testMatch` only covers `api/__tests__/**`), so this task is verified manually instead of with automated tests.

- [ ] **Step 1: Add the HTML section**

In `admin.html`, insert the following immediately after the closing `</section>` of the 折扣券管理 section (i.e. right after line `329: </section>`, before the `<script>` block that defines `escHtml`/`createCoupon`/etc.):

```html
  <!-- ── Refund Management ────────────────────────────── -->
  <section style="margin-top:56px;max-width:480px;margin-left:auto;margin-right:auto;padding:0 24px 40px;">
    <h2 style="font-size:18px;font-weight:600;margin-bottom:20px">退款管理</h2>

    <div style="margin-bottom:20px">
      <label style="display:block;font-size:12px;color:#666;margin-bottom:4px">管理员密码</label>
      <input id="r-pw" type="password" placeholder="输入管理员密码" style="width:100%;padding:10px 12px;border:1px solid #d0d0d0;font-size:14px;outline:none;">
    </div>

    <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <label style="display:block;font-size:12px;color:#666;margin-bottom:4px">客户邮箱</label>
        <input id="r-email" type="email" placeholder="customer@example.com" style="width:100%;padding:9px 12px;border:1px solid #d0d0d0;font-size:14px">
      </div>
      <button onclick="loadRefundOrders()" style="padding:9px 18px;background:#111;color:#fff;border:none;font-size:12px;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;width:auto;margin-top:0">查询订单</button>
    </div>

    <div id="refund-orders" style="font-size:13px;color:#666">输入客户邮箱后点查询订单</div>
  </section>
```

- [ ] **Step 2: Add the JS**

In `admin.html`, add the following as a new `<script>` block right after the `</section>` closing tag inserted in Step 1 (i.e. before the existing `<script> function escHtml... </script>` block that follows the 折扣券管理 section — order doesn't matter for `escHtml` since all scripts run top-to-bottom and this new block only calls `escHtml` from inside functions triggered by later user clicks, not at load time):

```html
  <script>
    let refundOrdersCache = [];

    async function loadRefundOrders() {
      const pw = document.getElementById('r-pw').value;
      const email = document.getElementById('r-email').value.trim();
      const el = document.getElementById('refund-orders');
      if (!pw || !email) { el.textContent = '请填写管理员密码和客户邮箱'; return; }
      el.textContent = '加载中…';
      try {
        const r = await fetch('/api/admin/coupon?resource=orders&password=' + encodeURIComponent(pw) + '&email=' + encodeURIComponent(email));
        const d = await r.json();
        if (!d.orders) { el.textContent = d.error || '加载失败'; return; }
        if (d.orders.length === 0) { el.textContent = '该邮箱没有找到订单'; return; }
        refundOrdersCache = d.orders;
        renderRefundOrders();
      } catch {
        el.textContent = '请求失败';
      }
    }

    function renderRefundOrders() {
      const el = document.getElementById('refund-orders');
      el.innerHTML = refundOrdersCache.map((o, i) => {
        const date = new Date(o.date).toLocaleDateString('zh-CN');
        const amount = (o.amount / 100).toFixed(2) + ' ' + o.currency.toUpperCase();
        let statusLabel, actionHtml;
        if (o.refund_status === 'full') {
          statusLabel = '<span style="color:#c00">已全额退款</span>';
          actionHtml = '';
        } else {
          statusLabel = o.refund_status === 'partial'
            ? '<span style="color:#b8860b">部分退款 ' + escHtml((o.amount_refunded / 100).toFixed(2)) + ' ' + escHtml(o.currency.toUpperCase()) + '</span>'
            : '<span style="color:#888">未退款</span>';
          actionHtml =
            '<label style="font-size:12px;margin-right:8px"><input type="radio" name="r-type-' + i + '" value="full" checked onchange="toggleRefundAmount(' + i + ')"> 全额</label>'
            + '<label style="font-size:12px;margin-right:8px"><input type="radio" name="r-type-' + i + '" value="partial" onchange="toggleRefundAmount(' + i + ')"> 部分</label>'
            + '<input id="r-amount-' + i + '" type="number" min="0" step="0.01" placeholder="金额" disabled style="width:80px;padding:4px 6px;font-size:12px;border:1px solid #d0d0d0;margin-right:8px">'
            + '<button onclick="submitRefund(' + i + ')" style="padding:4px 10px;font-size:12px;cursor:pointer;color:#c00;border:1px solid #d0d0d0;background:#fff;width:auto;margin-top:0">退款</button>';
        }
        return '<div id="refund-row-' + i + '" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f0f0f0;flex-wrap:wrap">'
          + '<span>' + escHtml(date) + '</span>'
          + '<strong>' + escHtml(amount) + '</strong>'
          + statusLabel
          + actionHtml
          + '</div>';
      }).join('');
    }

    function toggleRefundAmount(i) {
      const type = document.querySelector('input[name="r-type-' + i + '"]:checked').value;
      document.getElementById('r-amount-' + i).disabled = type !== 'partial';
    }

    async function submitRefund(i) {
      const order = refundOrdersCache[i];
      const type = document.querySelector('input[name="r-type-' + i + '"]:checked').value;
      const amountInput = document.getElementById('r-amount-' + i).value;
      if (type === 'partial' && !amountInput) { alert('请输入部分退款金额'); return; }
      if (!confirm('确认给这笔订单' + (type === 'full' ? '全额' : '部分') + '退款？此操作不可撤销。')) return;

      const pw = document.getElementById('r-pw').value;
      const body = { password: pw, session_id: order.session_id };
      if (type === 'partial') body.amount = Number(amountInput);

      const r = await fetch('/api/admin/coupon?resource=refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!d.refunded) { alert(d.error || '退款失败'); return; }

      order.amount_refunded = (order.amount_refunded || 0) + d.amount;
      order.refund_status = order.amount_refunded >= order.amount ? 'full' : 'partial';
      renderRefundOrders();
    }
  </script>
```

- [ ] **Step 3: Manually verify the flow locally**

Run: `vercel dev` (or the project's existing local dev command) from `/Users/loren/Desktop/lypspace-clone`, then open `http://localhost:3000/admin` in a browser and confirm:
1. Entering a wrong admin password + a real customer email under "退款管理" shows an error, not a silent failure.
2. Entering the correct admin password + a customer email that has at least one Stripe test-mode order shows that order's date, amount, and status.
3. Selecting "部分" reveals the amount input; selecting "全额" hides/disables it.
4. Clicking "退款" shows the `confirm()` dialog before doing anything.
5. After confirming a refund against a Stripe **test-mode** session, the row updates in place to reflect the new refund status without re-querying.

Expected: all five behaviors match; no browser console errors.

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "Add refund management UI to /admin"
```
