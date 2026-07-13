# Newsletter Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Stay in the loop" email form on `index.html` actually capture subscriber emails, send a welcome email, and let the admin view the subscriber list.

**Architecture:** Two new actions on the existing `api/checkout.js` serverless function (`subscribe` POST, `list-subscribers` GET) backed by one new Supabase table `newsletter_subscribers`. No new API file. Frontend: `index.html`'s signup form gets a real submit handler; `admin-orders.html` gets a read-only subscriber list section reusing its existing password gate.

**Tech Stack:** Node.js Vercel serverless function (`api/checkout.js`), Supabase (`@supabase/supabase-js`), Resend (`resend` npm package, already a dependency), vanilla JS/HTML frontend, Jest for API tests.

## Global Constraints

- Do not create a new `/api/*.js` file — Vercel Hobby plan's 12-function limit is already maxed out (spec: "Change" section). Add both new actions to `api/checkout.js`.
- Do not touch `catalog.html`, `product.html`, `cart.js`, or any page/table other than `index.html`, `admin-orders.html`, `js/i18n.js`, and `api/checkout.js` (spec: "Out of scope").
- A duplicate-subscribe (email already in the table) must be a silent no-op: no second insert, no second welcome email, same success response as a first-time subscribe (spec: "Change" / frontend bullet).
- A Resend send failure must never fail the `subscribe` request — the row is already stored, so log and still return success (spec: "Change" — API bullet).
- `list-subscribers` uses the same admin-password check pattern as the existing `action=admin-orders` (`req.query.password !== process.env.ADMIN_PASSWORD` → 401).
- No unsubscribe flow, no CSV export, no double opt-in (spec: "Out of scope").

---

## Task 1: `newsletter_subscribers` table + `POST action=subscribe`

**Files:**
- Modify: `api/checkout.js:1` (top-level requires), `api/checkout.js:126-130` (insert new action block)
- Test: `__tests__/checkout-subscribe.test.js` (create)

**Interfaces:**
- Consumes: existing `getSupabase()` from `api/_lib/supabase.js` (already required inside the handler at `api/checkout.js:5`); existing top-level `Stripe` require pattern to mirror for `Resend`.
- Produces: `POST /api/checkout?action=subscribe` with body `{ email: string }` → `200 { subscribed: true }` on success (both first-time and duplicate), `400 { error: string }` on missing/invalid email. Later tasks (Task 2, Task 3) call this exact endpoint/action name and response shape.

**Manual step (not automated — no DB-access tool available in this session):** before this task's tests will pass against a real deployment (not needed for the Jest tests below, which mock Supabase), run this once in the Supabase SQL editor:

```sql
create table newsletter_subscribers (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table newsletter_subscribers enable row level security;
```

No RLS policies are added — this table is only ever read/written via `SUPABASE_SERVICE_KEY` inside `api/checkout.js` (same pattern as `order_links`, `custom_products`, `site_settings`), never from the browser with the anon key, so RLS with zero policies (deny-all) is correct and matches existing tables' access model.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/checkout-subscribe.test.js`:

```js
process.env.ADMIN_PASSWORD = 'test-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.SUPABASE_URL = 'https://dummy.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'dummy-key';
process.env.RESEND_API_KEY = 're_test_dummy';

const handler = require('../api/checkout');
const { Resend } = require('resend');

const mockSend = jest.fn();
Resend.mockImplementation(() => ({ emails: { send: mockSend } }));

const stripeMockInstance = {
  checkout: { sessions: { create: jest.fn(), retrieve: jest.fn() } },
  coupons: { retrieve: jest.fn(), create: jest.fn() },
};
global.__stripeMock = jest.fn(() => stripeMockInstance);

const mockSupabaseFrom = jest.fn();
jest.mock('../api/_lib/supabase', () => ({
  getSupabase: () => ({ from: mockSupabaseFrom }),
}));

function makeReq(body = {}) {
  return { method: 'POST', query: {}, body: { action: 'subscribe', ...body } };
}
function makeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.end = jest.fn(() => res);
  return res;
}

describe('POST /api/checkout action=subscribe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: 'email_1' } });
  });

  test('returns 400 for missing email', async () => {
    const req = makeReq({});
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 for invalid email format', async () => {
    const req = makeReq({ email: 'not-an-email' });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('new subscriber: inserts row and sends welcome email', async () => {
    const insertFn = jest.fn().mockResolvedValue({ data: null, error: null });
    mockSupabaseFrom.mockImplementation((table) => {
      if (table === 'newsletter_subscribers') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
          insert: insertFn,
        };
      }
    });

    const req = makeReq({ email: 'new@test.com' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ subscribed: true });
    expect(insertFn).toHaveBeenCalledWith({ email: 'new@test.com' });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe('new@test.com');
  });

  test('duplicate subscriber: no insert, no email, still returns success', async () => {
    const insertFn = jest.fn();
    mockSupabaseFrom.mockImplementation((table) => {
      if (table === 'newsletter_subscribers') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { email: 'exists@test.com' }, error: null }) }),
          }),
          insert: insertFn,
        };
      }
    });

    const req = makeReq({ email: 'exists@test.com' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ subscribed: true });
    expect(insertFn).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('Resend failure still returns success (email already stored)', async () => {
    mockSupabaseFrom.mockImplementation((table) => {
      if (table === 'newsletter_subscribers') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
    });
    mockSend.mockRejectedValue(new Error('Resend down'));

    const req = makeReq({ email: 'new2@test.com' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ subscribed: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest checkout-subscribe -v`
Expected: FAIL — `action === 'subscribe'` branch doesn't exist yet, so every request falls through to the main checkout-session code and errors or returns the wrong shape.

- [ ] **Step 3: Implement**

In `api/checkout.js`, change line 1 from:

```js
const Stripe = require('stripe');
```

to:

```js
const Stripe = require('stripe');
const { Resend } = require('resend');

const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
```

Then, at `api/checkout.js:126-130` (currently):

```js
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const { action, code, email: validateEmail } = req.body || {};

  // ── Product update (admin) ───────────────────────────────────────
```

change to:

```js
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { action, code, email: validateEmail } = req.body || {};

  // ── Newsletter subscribe (public) ─────────────────────────────────
  if (action === 'subscribe') {
    const { email: subEmail } = req.body || {};
    const isValidEmail = typeof subEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subEmail);
    if (!isValidEmail) return res.status(400).json({ error: 'Valid email required' });

    const supabase = getSupabase();
    const { data: existing } = await supabase
      .from('newsletter_subscribers')
      .select('email')
      .eq('email', subEmail)
      .maybeSingle();

    if (!existing) {
      await supabase.from('newsletter_subscribers').insert({ email: subEmail });
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: subEmail,
          subject: 'Welcome to LYP SPACE',
          html: `
            <div style="font-family:Helvetica Neue,Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;padding:40px 0;">
              <h2 style="font-weight:400;letter-spacing:0.04em;margin-bottom:24px;">Welcome to LYP SPACE</h2>
              <p style="margin-bottom:16px;">Thanks for subscribing — you'll be the first to hear about exclusive deals and new arrivals.</p>
            </div>
          `,
        });
      } catch (err) {
        console.error('[checkout] subscribe: welcome email failed to send', { email: subEmail, error: err.message });
      }
    }

    return res.status(200).json({ subscribed: true });
  }

  // ── Product update (admin) ───────────────────────────────────────
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest checkout-subscribe -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx jest -v`
Expected: PASS (all existing suites plus the new one)

- [ ] **Step 6: Commit**

```bash
git add api/checkout.js __tests__/checkout-subscribe.test.js
git commit -m "feat: add newsletter subscribe action to checkout API"
```

---

## Task 2: `GET action=list-subscribers`

**Files:**
- Modify: `api/checkout.js:124-125` (insert new action block between the `products` GET action and the `POST`-only gate)
- Test: `__tests__/checkout-list-subscribers.test.js` (create)

**Interfaces:**
- Consumes: `getSupabase()` (same as Task 1); the `newsletter_subscribers` table created in Task 1.
- Produces: `GET /api/checkout?action=list-subscribers&password=...` → `200 { subscribers: [{ email, created_at }, ...] }` ordered newest-first, or `401 { error: 'Unauthorized' }`. Task 4's admin UI calls this exact endpoint/action name and response shape.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/checkout-list-subscribers.test.js`:

```js
process.env.ADMIN_PASSWORD = 'test-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.SUPABASE_URL = 'https://dummy.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'dummy-key';

const handler = require('../api/checkout');

const mockSupabaseFrom = jest.fn();
jest.mock('../api/_lib/supabase', () => ({
  getSupabase: () => ({ from: mockSupabaseFrom }),
}));

function makeReq(query = {}) {
  return { method: 'GET', query, body: {} };
}
function makeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.end = jest.fn(() => res);
  return res;
}

describe('GET /api/checkout?action=list-subscribers', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 401 when password is wrong', async () => {
    const req = makeReq({ action: 'list-subscribers', password: 'wrong' });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns subscribers newest first', async () => {
    const rows = [
      { email: 'a@test.com', created_at: '2026-07-10T00:00:00Z' },
      { email: 'b@test.com', created_at: '2026-07-01T00:00:00Z' },
    ];
    mockSupabaseFrom.mockImplementation((table) => {
      if (table === 'newsletter_subscribers') {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: rows, error: null }),
          }),
        };
      }
    });

    const req = makeReq({ action: 'list-subscribers', password: 'test-secret' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const { subscribers } = res.json.mock.calls[0][0];
    expect(subscribers).toEqual(rows);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest checkout-list-subscribers -v`
Expected: FAIL — no `action === 'list-subscribers'` branch exists yet, so the GET request falls through to a 405.

- [ ] **Step 3: Implement**

In `api/checkout.js`, at lines 124-126 (currently):

```js
    return res.status(200).json({ products });
  }

  if (req.method !== 'POST') return res.status(405).end();
```

change to:

```js
    return res.status(200).json({ products });
  }

  // ── Newsletter subscribers list (GET, admin) ─────────────────────
  if (req.method === 'GET' && req.query.action === 'list-subscribers') {
    if (req.query.password !== process.env.ADMIN_PASSWORD)
      return res.status(401).json({ error: 'Unauthorized' });
    const supabase = getSupabase();
    const { data } = await supabase
      .from('newsletter_subscribers')
      .select('email, created_at')
      .order('created_at', { ascending: false });
    return res.status(200).json({ subscribers: data || [] });
  }

  if (req.method !== 'POST') return res.status(405).end();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest checkout-list-subscribers -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx jest -v`
Expected: PASS (all suites)

- [ ] **Step 6: Commit**

```bash
git add api/checkout.js __tests__/checkout-list-subscribers.test.js
git commit -m "feat: add admin list-subscribers action to checkout API"
```

---

## Task 3: Wire the subscribe form on `index.html`

**Files:**
- Modify: `index.html:1094-1097` (signup form markup + new inline message element), `index.html` `<style>` block after line 594 (new message styles), `index.html` (new `<script>` block for the submit handler)
- Modify: `js/i18n.js` (add `subscribe_success` / `subscribe_invalid` / `subscribe_error` keys to all 6 language blocks)

**Interfaces:**
- Consumes: `POST /api/checkout?action=subscribe` from Task 1 (`{ email }` → `200 { subscribed: true }` or `400 { error }`).
- Produces: nothing consumed by later tasks (Task 4 is independent).

- [ ] **Step 1: Update the form markup**

In `index.html`, change lines 1090-1098 from:

```html
  <!-- EMAIL SIGNUP -->
  <section class="signup-section">
    <h2 data-i18n="signup_title">Stay in the loop</h2>
    <p data-i18n="signup_body">Get exclusive deals and early access to new products</p>
    <form class="signup-form" onsubmit="return false;">
      <input type="email" data-i18n-ph="signup_ph" placeholder="Your email address" />
      <button type="submit" data-i18n="subscribe_btn">Subscribe</button>
    </form>
  </section>
```

to:

```html
  <!-- EMAIL SIGNUP -->
  <section class="signup-section">
    <h2 data-i18n="signup_title">Stay in the loop</h2>
    <p data-i18n="signup_body">Get exclusive deals and early access to new products</p>
    <form class="signup-form" id="signup-form" onsubmit="return handleSubscribe(event)">
      <input type="email" id="signup-email" data-i18n-ph="signup_ph" placeholder="Your email address" />
      <button type="submit" id="signup-btn" data-i18n="subscribe_btn">Subscribe</button>
    </form>
    <p id="signup-msg" class="signup-msg" style="display:none;"></p>
  </section>
```

- [ ] **Step 2: Add message styling**

In `index.html`, right after the `.signup-form button:hover` rule (currently ending at line 594):

```css
    .signup-form button:hover {
      background: var(--white);
      color: var(--black);
    }
```

add:

```css
    .signup-form button:hover {
      background: var(--white);
      color: var(--black);
    }

    .signup-msg {
      margin-top: 14px;
      font-size: 13px;
    }

    .signup-msg.success { color: #1a6e3c; }
    .signup-msg.error { color: #c0392b; }
```

- [ ] **Step 3: Add the submit handler script**

Add this `<script>` block right before `</body>` (or alongside the other inline `<script>` blocks already in `index.html` — place it as its own block near the end of the file so it runs after `js/i18n.js` has attached translated strings):

```html
  <script>
    async function handleSubscribe(event) {
      event.preventDefault();
      const emailInput = document.getElementById('signup-email');
      const btn = document.getElementById('signup-btn');
      const msg = document.getElementById('signup-msg');
      const email = emailInput.value.trim();

      msg.style.display = 'none';
      msg.className = 'signup-msg';

      const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!isValidEmail) {
        msg.textContent = window.i18n.t('subscribe_invalid');
        msg.classList.add('error');
        msg.style.display = 'block';
        return false;
      }

      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = '...';

      try {
        const r = await fetch('/api/checkout?action=subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (!r.ok) throw new Error('subscribe failed');
        msg.textContent = window.i18n.t('subscribe_success');
        msg.classList.add('success');
        emailInput.value = '';
      } catch {
        msg.textContent = window.i18n.t('subscribe_error');
        msg.classList.add('error');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
        msg.style.display = 'block';
      }
      return false;
    }
  </script>
```

`js/i18n.js` already exposes `window.i18n = { t, getLang, setLang }` (its `t(key)` falls back to the English string, then to the raw key, if a translation is missing — see `js/i18n.js:334-337`), so no changes to `js/i18n.js`'s public shape are needed beyond the three new key/value pairs added in Step 4.

- [ ] **Step 4: Add the three new i18n keys to all 6 languages**

In `js/i18n.js`, each language block has a line like (English shown, at line 26):

```js
      signup_ph: 'Your email address', subscribe_btn: 'Subscribe',
```

After that line, in each of the 6 language blocks (EN, ES, DE, FR, IT, PT), add:

```js
      subscribe_success: 'Subscribed! Check your inbox for a welcome email.',
      subscribe_invalid: 'Please enter a valid email address.',
      subscribe_error: 'Something went wrong. Please try again.',
```

using these per-language values:

| lang | subscribe_success | subscribe_invalid | subscribe_error |
|---|---|---|---|
| EN | Subscribed! Check your inbox for a welcome email. | Please enter a valid email address. | Something went wrong. Please try again. |
| ES | ¡Suscrito! Revisa tu bandeja de entrada para ver el correo de bienvenida. | Por favor, introduce una dirección de correo válida. | Algo salió mal. Inténtalo de nuevo. |
| DE | Abonniert! Schau in dein Postfach für die Willkommens-E-Mail. | Bitte gib eine gültige E-Mail-Adresse ein. | Etwas ist schiefgelaufen. Bitte versuche es erneut. |
| FR | Abonné(e) ! Consultez votre boîte de réception pour l'e-mail de bienvenue. | Veuillez saisir une adresse e-mail valide. | Une erreur s'est produite. Veuillez réessayer. |
| IT | Iscrizione avvenuta! Controlla la tua casella per l'email di benvenuto. | Inserisci un indirizzo email valido. | Qualcosa è andato storto. Riprova. |
| PT | Subscrito! Verifique a sua caixa de entrada para o email de boas-vindas. | Por favor, insira um endereço de email válido. | Algo correu mal. Tente novamente. |

- [ ] **Step 5: Manual verification (no automated frontend test harness exists in this repo — `jest` here only covers `api/*.js`)**

Run: `npx vercel dev` (or the project's usual local-dev command) and open the homepage in a browser. Test all four paths:
1. Enter a valid, never-used email → click Subscribe → button shows a brief loading state → green "Subscribed!" message appears, input clears.
2. Submit the same email again → still shows the success message (duplicate is silently a no-op server-side, per spec).
3. Enter `not-an-email` → red "Please enter a valid email address." message appears, no network request needed to fail visibly wrong (the `400` path from the server should also be reachable if client validation is bypassed, e.g. via devtools).
4. Open Network tab, confirm the request is `POST /api/checkout?action=subscribe` with JSON body `{"email": "..."}`.
5. Switch the language switcher through all 6 languages and confirm the success/error strings appear translated (not falling back to English) when subscribing in each.

- [ ] **Step 6: Commit**

```bash
git add index.html js/i18n.js
git commit -m "feat: wire newsletter signup form to subscribe API"
```

---

## Task 4: Subscriber list in `admin-orders.html`

**Files:**
- Modify: `admin-orders.html` (add a subscribers section, fetch call, and render function)

**Interfaces:**
- Consumes: `GET /api/checkout?action=list-subscribers&password=...` from Task 2 (`{ subscribers: [{ email, created_at }] }`).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Add the subscribers section markup**

In `admin-orders.html`, change lines 79-81 from:

```html
      <div id="empty">暂无符合条件的订单</div>
    </div>
  </div>
```

to:

```html
      <div id="empty">暂无符合条件的订单</div>
    </div>

    <h1 style="margin-top:40px;">订阅名单</h1>
    <div id="sub-table-wrap" style="display:none;">
      <table>
        <thead>
          <tr>
            <th>邮箱</th>
            <th>订阅时间</th>
          </tr>
        </thead>
        <tbody id="sub-tbody"></tbody>
      </table>
      <div id="sub-empty" style="text-align:center;padding:48px 0;font-size:13px;color:#888;display:none;">暂无订阅者</div>
    </div>
  </div>
```

- [ ] **Step 2: Fetch and render subscribers alongside orders**

In `admin-orders.html`, change the `loadOrders()` function (currently lines 91-109):

```js
    async function loadOrders() {
      const pw = document.getElementById('pw').value.trim();
      const errEl = document.getElementById('err');
      errEl.textContent = '';
      if (!pw) { errEl.textContent = '请输入管理员密码'; return; }

      try {
        const r = await fetch('/api/checkout?action=admin-orders&password=' + encodeURIComponent(pw));
        if (r.status === 401) { errEl.textContent = '密码错误'; return; }
        if (!r.ok) { errEl.textContent = '加载失败，请重试'; return; }
        const { orders } = await r.json();
        allOrders = orders || [];
        document.getElementById('controls').style.display = 'flex';
        document.getElementById('table-wrap').style.display = 'block';
        renderTable();
      } catch {
        errEl.textContent = '网络错误，请重试';
      }
    }
```

to:

```js
    async function loadOrders() {
      const pw = document.getElementById('pw').value.trim();
      const errEl = document.getElementById('err');
      errEl.textContent = '';
      if (!pw) { errEl.textContent = '请输入管理员密码'; return; }

      try {
        const r = await fetch('/api/checkout?action=admin-orders&password=' + encodeURIComponent(pw));
        if (r.status === 401) { errEl.textContent = '密码错误'; return; }
        if (!r.ok) { errEl.textContent = '加载失败，请重试'; return; }
        const { orders } = await r.json();
        allOrders = orders || [];
        document.getElementById('controls').style.display = 'flex';
        document.getElementById('table-wrap').style.display = 'block';
        renderTable();
        loadSubscribers(pw);
      } catch {
        errEl.textContent = '网络错误，请重试';
      }
    }

    async function loadSubscribers(pw) {
      try {
        const r = await fetch('/api/checkout?action=list-subscribers&password=' + encodeURIComponent(pw));
        if (!r.ok) return;
        const { subscribers } = await r.json();
        renderSubscribers(subscribers || []);
      } catch {
        // Subscriber list is secondary to the orders table; a failure here stays silent
        // rather than overwriting the orders-specific error message in #err.
      }
    }

    function renderSubscribers(subscribers) {
      const tbody = document.getElementById('sub-tbody');
      const emptyEl = document.getElementById('sub-empty');
      document.getElementById('sub-table-wrap').style.display = 'block';

      if (subscribers.length === 0) {
        tbody.innerHTML = '';
        emptyEl.style.display = 'block';
        return;
      }
      emptyEl.style.display = 'none';

      tbody.innerHTML = subscribers.map(s => {
        const date = s.created_at ? new Date(s.created_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
        return `<tr>
          <td>${esc(s.email)}</td>
          <td style="white-space:nowrap;color:#666;">${date}</td>
        </tr>`;
      }).join('');
    }
```

- [ ] **Step 3: Manual verification (no automated frontend test harness exists in this repo)**

Run: `npx vercel dev`, open `/admin-orders`, enter the admin password, click "加载订单". Confirm:
1. The existing orders table still loads and behaves exactly as before (this task must not change any orders behavior).
2. A new "订阅名单" table appears below it listing every row from `newsletter_subscribers`, newest first, with `email` and a formatted `订阅时间`.
3. With zero rows in the table, "暂无订阅者" is shown instead of an empty table.

- [ ] **Step 4: Commit**

```bash
git add admin-orders.html
git commit -m "feat: show newsletter subscriber list in admin orders page"
```

---

## Self-Review Notes

- **Spec coverage:** storage (Task 1) ✓, subscribe API + welcome email + duplicate no-op + Resend-failure-still-succeeds (Task 1) ✓, admin list API (Task 2) ✓, frontend form wiring + i18n (Task 3) ✓, admin UI (Task 4) ✓, out-of-scope items (unsubscribe/CSV/double-opt-in) correctly excluded from all tasks.
- **Type consistency:** `subscribe` request body `{ email }` (Task 1) matches what Task 3's `handleSubscribe` sends. `list-subscribers` response `{ subscribers: [{ email, created_at }] }` (Task 2) matches what Task 4's `renderSubscribers` consumes.
- **Placeholder scan:** no TBDs; the one manual/non-automated step (Supabase SQL) is called out explicitly with the exact SQL to run, not deferred vaguely.
