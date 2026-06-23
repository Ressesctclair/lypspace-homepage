# User Authentication & Account System Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add user login (email+password + Google OAuth), saved addresses, order history with shipping status, and admin-managed member pricing to the lypspace-homepage Vercel site.

**Architecture:** Self-hosted JWT auth (httpOnly cookie) + Supabase PostgreSQL database + standard Google OAuth 2.0. No framework migration — new HTML pages + new Vercel Functions added alongside existing code.

**Tech Stack:** `jsonwebtoken`, `bcryptjs`, `@supabase/supabase-js`, Google OAuth 2.0, Vercel Functions (Node.js), Supabase (PostgreSQL)

---

## Global Constraints

- All existing files (`api/webhook.js`, `api/ship.js`, `admin.html`, `index.html`, `vercel.json`) must remain fully functional — no breaking changes.
- JWT stored in httpOnly, Secure, SameSite=Strict cookie named `auth_token`, 7-day expiry.
- Passwords hashed with bcryptjs cost factor 12. Plain-text passwords never logged or stored.
- All API endpoints that read/write user data must verify the JWT before responding.
- Admin endpoints (`/api/admin/*`) protected by existing `ADMIN_PASSWORD` env var check.
- All user-facing HTML pages must match the existing black/white minimal style of `index.html`.
- Mobile-responsive (same breakpoints as `index.html`).
- HTML-escape all user-supplied values before inserting into HTML templates (same `escHtml()` pattern already in `api/ship.js`).
- Environment variables required (added to Vercel): `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SITE_URL`.

---

## Database Schema (Supabase)

```sql
-- Run in Supabase SQL editor

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text, -- null for Google-only accounts
  is_member boolean not null default false,
  google_id text unique,
  name text,
  created_at timestamptz not null default now()
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  street text not null,
  city text not null,
  postal_code text not null,
  country text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table order_links (
  stripe_session_id text primary key,
  user_id uuid references users(id) on delete set null,
  customer_email text not null,
  created_at timestamptz not null default now()
);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text, -- nullable: admin may not have session ID
  carrier text not null,
  tracking_number text not null,
  sent_at timestamptz not null default now()
);
```

---

## File Structure

**New files to create:**
- `login.html` — login/register/Google OAuth page
- `dashboard.html` — user home (orders summary, default address, member badge)
- `orders.html` — full order history + shipping status
- `profile.html` — address management, change password
- `api/auth/register.js` — POST: email+password registration
- `api/auth/login.js` — POST: email+password login
- `api/auth/logout.js` — GET: clear auth cookie
- `api/auth/google.js` — GET: redirect to Google OAuth
- `api/auth/callback.js` — GET: Google OAuth callback handler
- `api/auth/me.js` — GET: return current user from JWT
- `api/user/orders.js` — GET: order history (Stripe + order_links + shipments)
- `api/user/addresses.js` — GET list / POST create / DELETE remove
- `api/admin/set-member.js` — POST: toggle is_member for a user email

**Files to modify:**
- `vercel.json` — add rewrites for `/login`, `/dashboard`, `/orders`, `/profile`
- `api/webhook.js` — on `checkout.session.completed`, write to `order_links` (user_id from metadata if present, always write customer_email)
- `api/ship.js` — on successful send, write to `shipments` table
- `admin.html` — add member management section at bottom
- `index.html` — add login/account link in header nav

---

## API Endpoints

### POST /api/auth/register
**Input:** `{ email, password }` (JSON body)
**Validation:** email format, password ≥ 8 chars
**Logic:**
1. Check `users` table — if email exists, return 409
2. Hash password: `bcrypt.hash(password, 12)`
3. Insert into `users`
4. Sign JWT: `{ userId, email }`, 7d expiry
5. Set httpOnly cookie `auth_token`
6. Return `{ user: { id, email, is_member, name } }`

**Errors:** 400 validation, 409 email taken, 500 server error

### POST /api/auth/login
**Input:** `{ email, password }` (JSON body)
**Logic:**
1. Fetch user by email from `users`
2. If not found or `password_hash` is null (Google-only account): return 401
3. `bcrypt.compare(password, user.password_hash)` — if false: return 401
4. Sign JWT, set cookie
5. Return `{ user: { id, email, is_member, name } }`

**Errors:** 401 invalid credentials, 500 server error

### GET /api/auth/logout
Sets `auth_token` cookie to empty string with `maxAge=0`. Returns `{ ok: true }`.

### GET /api/auth/google
Redirects to Google OAuth URL:
```
https://accounts.google.com/o/oauth2/v2/auth?
  client_id=GOOGLE_CLIENT_ID
  &redirect_uri=SITE_URL/api/auth/callback
  &response_type=code
  &scope=openid email profile
```

### GET /api/auth/callback?code=xxx
**Logic:**
1. Exchange `code` for tokens via `https://oauth2.googleapis.com/token`
2. Fetch user info from `https://www.googleapis.com/oauth2/v3/userinfo`
3. Upsert into `users` (match on `google_id`; if email exists without google_id, link accounts)
4. Sign JWT, set cookie
5. Redirect to `/dashboard`

**Errors:** On failure, redirect to `/login?error=google_failed`

### GET /api/auth/me
Reads `auth_token` cookie, verifies JWT. Fetches fresh user row from Supabase (so `is_member` is always current).
- Valid: return `{ user: { id, email, is_member, name, hasPassword: boolean } }`
  - `hasPassword` is `true` if `password_hash` is non-null in DB (used by profile.html to show/hide change-password form)
- Invalid/missing: return 401 `{ error: 'unauthenticated' }`

### GET /api/user/orders
Requires valid JWT. Steps:
1. Query `order_links` where `user_id = me.id` OR `customer_email = me.email`
2. For each session ID, fetch from Stripe API: `stripe.checkout.sessions.retrieve(id, { expand: ['line_items'] })`
3. For each session, check `shipments` table for tracking info
4. Return array of orders sorted by date desc:
```json
[{
  "session_id": "cs_xxx",
  "date": "2026-06-23T10:00:00Z",
  "amount": 4999,
  "currency": "usd",
  "items": [{ "name": "Product A", "quantity": 1 }],
  "status": "shipped" | "processing",
  "tracking": { "carrier": "顺丰", "number": "SF123" } | null
}]
```

### GET /api/user/addresses
Requires valid JWT. Returns all addresses for `user_id`.

### POST /api/user/addresses
Requires valid JWT.
**Input:** `{ name, street, city, postal_code, country, is_default }`
**Logic:** If `is_default=true`, first set all existing addresses `is_default=false`, then insert.
Returns created address.

### DELETE /api/user/addresses
Requires valid JWT.
**Input:** `{ id }` (query param or JSON body)
Only deletes if address `user_id` matches JWT user — never delete another user's address.

### POST /api/admin/set-member
Protected by `ADMIN_PASSWORD` (same pattern as `api/ship.js`).
**Input:** `{ password, email, is_member }` (JSON body)
**Logic:** Update `users.is_member` where `email` matches.
Returns `{ updated: true }`.

---

## Auth Middleware Pattern

Every protected endpoint uses this helper (extracted to `api/_lib/auth.js`):

```js
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

function requireAuth(req, res) {
  const cookies = cookie.parse(req.headers.cookie || '');
  const token = cookies.auth_token;
  if (!token) { res.status(401).json({ error: 'unauthenticated' }); return null; }
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    res.status(401).json({ error: 'unauthenticated' }); return null;
  }
}
module.exports = { requireAuth };
```

---

## Webhook Modification (api/webhook.js)

On `checkout.session.completed`, after sending order confirmation email, also write to `order_links`:

```js
const userId = session.metadata?.userId || null;
const customerEmail = session.customer_details?.email || session.customer_email;
if (customerEmail) {
  await supabase.from('order_links').upsert({
    stripe_session_id: session.id,
    user_id: userId,
    customer_email: customerEmail,
  }, { onConflict: 'stripe_session_id' });
}
```

## Ship Endpoint Modification (api/ship.js)

After sending shipping email, also write to `shipments`:

```js
await supabase.from('shipments').insert({
  stripe_session_id: req.body.stripeSessionId || null,
  carrier,
  tracking_number: trackingNumber,
});
```

Note: `stripeSessionId` is an optional field added to the existing admin shipping form in `admin.html` (new input below trackingNumber, labeled "Stripe Session ID（可选）").

---

## Frontend Pages

### login.html
- Tab switcher: "登录" / "注册"
- Login form: email, password, submit → `POST /api/auth/login`
- Register form: email, password, confirm password, submit → `POST /api/auth/register`
- Google button: links to `/api/auth/google`
- On success: redirect to `/dashboard`
- On error: show inline error message
- Style: centered card, matches `index.html` font/colors

### dashboard.html
- On load: fetch `/api/auth/me` → if 401, redirect to `/login`
- Header: site nav + "退出登录" button (calls `/api/auth/logout` then redirects to `/`)
- Welcome: "你好，{name}" + member badge if `is_member = true`
- Recent orders: fetch `/api/user/orders`, show latest 3, "查看全部" link to `/orders`
- Default address card: fetch `/api/user/addresses`, show `is_default=true` one
- Links: 订单历史 / 地址管理 / 退出登录

### orders.html
- On load: auth check, then fetch `/api/user/orders`
- Each order card: date, amount, item names, status chip (发货中/已发货)
- If shipped: show carrier + tracking number
- Empty state: "暂无订单记录"

### profile.html
- On load: auth check, then fetch `/api/user/addresses`
- Address list: each card has "设为默认" and "删除" buttons
- Add address form: name, street, city, postal_code, country, is_default checkbox
- Change password section (hidden if Google-only account — detected via `/api/auth/me` returning `hasPassword: boolean`)
- Change password form: current password, new password (≥8 chars), confirm new password → `POST /api/auth/change-password`

### POST /api/auth/change-password
Requires valid JWT.
**Input:** `{ currentPassword, newPassword }`
**Logic:**
1. Load user from DB; if `password_hash` is null (Google account), return 400
2. `bcrypt.compare(currentPassword, user.password_hash)` — if false, return 401
3. `bcrypt.hash(newPassword, 12)` → update `users.password_hash`
4. Return `{ ok: true }`

**Errors:** 400 (Google account, no password), 401 (wrong current password), 400 (new password < 8 chars)

---

## vercel.json Additions

```json
{ "source": "/login", "destination": "/login.html" },
{ "source": "/dashboard", "destination": "/dashboard.html" },
{ "source": "/orders", "destination": "/orders.html" },
{ "source": "/profile", "destination": "/profile.html" }
```

---

## index.html Header Modification

Add to the existing nav bar:
- If not logged in: "登录" link → `/login`
- If logged in (check via `/api/auth/me` on page load): "我的账户" link → `/dashboard`

---

## Admin Panel Addition (admin.html)

New section below existing shipping form:

```
── 会员管理 ──
管理员密码: [same field, re-enter]
用户邮箱: [input]
会员状态: [设为会员 / 取消会员] (radio or toggle)
[提交]
→ POST /api/admin/set-member
```

---

## Environment Variables (add to Vercel)

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Random 64-char string, sign/verify JWTs |
| `SUPABASE_URL` | From Supabase project settings |
| `SUPABASE_SERVICE_KEY` | Service role key (bypasses row-level security) |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console OAuth credentials |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console OAuth credentials |
| `SITE_URL` | `https://lypspace-homepage.vercel.app` (no trailing slash) |

---

## Out of Scope

- Multi-language support (separate phase)
- Phase 2 discount codes (separate phase)
- Password reset via email (can add later; not in this phase)
- Email verification on registration (can add later)
- Stripe subscription-based member pricing (user chose manual admin assignment)
