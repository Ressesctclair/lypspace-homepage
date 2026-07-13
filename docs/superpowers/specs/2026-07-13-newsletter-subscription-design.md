# Newsletter Subscription — Design

## Problem

`index.html`'s "Stay in the loop" section (`.signup-section`) has a working-looking email form, but `<form onsubmit="return false;">` swallows every submit — clicking Subscribe does nothing, and no email is ever captured. Buyer emails already land in `order_links.customer_email`, but that only covers people who complete a purchase; there's no way to capture emails from visitors who browse but don't buy.

## Change

**Storage:** new Supabase table `newsletter_subscribers` (`email` unique text, `created_at` timestamptz default now()). No relation to `users` or `order_links` — this is a separate, password-less contact list.

**API — both actions added to `api/checkout.js`, no new API file (12-function cap already maxed):**
- `POST action=subscribe`, body `{ email }`. Validates basic email format (400 if missing/invalid). Upserts on `email` (conflict → no-op, do not re-send the welcome email or error). On a genuinely new row, sends a welcome email via Resend using the same `Resend`/`FROM_EMAIL`/`escHtml` pattern already used in `api/webhook.js`. A Resend send failure is logged but does **not** fail the request — the email is already stored, so the subscribe call still returns success.
- `GET action=list-subscribers`, query `password`. Same admin-password check pattern as `action=admin-orders` (`req.query.password !== process.env.ADMIN_PASSWORD` → 401). Returns all rows ordered by `created_at` descending.

**Frontend — `index.html` only:**
- Remove `onsubmit="return false;"`; wire real submit handler: disable button + show loading state → `POST /api/checkout?action=subscribe` → on success show an inline "Subscribed" message and clear the input; on 400 (invalid email) show an inline error; network/500 errors show a generic retry message. New i18n keys alongside the existing `signup_*`/`subscribe_btn` keys in `js/i18n.js` for the success/error strings, translated across all 6 languages.
- Duplicate-subscribe (server no-op) is shown to the visitor as the same success message — no need to distinguish "already subscribed" from "newly subscribed" in the UI.

**Admin — `admin-orders.html` only, no new page:**
- Add a "Newsletter Subscribers" section below the existing orders table, gated by the same password input/state already on the page. Fetches `action=list-subscribers` alongside (or after) the existing `action=admin-orders` call, using the same `pw` value. Renders a simple email + subscribed-date list.

## Out of scope

- No unsubscribe flow.
- No admin CSV export for subscribers (existing `exportCSV()` in `catalog.html` is unrelated and untouched).
- No double opt-in / confirmation-click step — the welcome email is a one-way notice, not a verification gate.
- No changes to `users`, `order_links`, or any other existing table/page.
