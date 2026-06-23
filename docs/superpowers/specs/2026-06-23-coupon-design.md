# 折扣券系统 Design Spec

**Date:** 2026-06-23  
**Project:** lypspace-homepage (lypspace-clone)  
**Status:** Approved

---

## Goal

让顾客在网站上输入折扣码，验证通过后带着折扣跳转结账。管理员在 `/admin` 页面管理所有折扣券。

---

## Architecture

**方式：** Stripe 原生 Coupon + Promotion Code 系统，Supabase 追踪 per-email 使用记录。

**核心变化：** 商品结账从静态 Stripe Payment Link 改为后端动态创建 Stripe Checkout Session，以便注入折扣。

---

## Components

### 1. 新 API 端点

#### `POST /api/coupon/validate`
验证折扣码是否可用。

**Request body:**
```json
{ "code": "SAVE10", "email": "user@example.com" }
```

**Logic:**
1. 调 `stripe.promotionCodes.list({ code })` 找到对应 Promotion Code
2. 检查 `active === true`，`expires_at` 未过期，`max_redemptions` 未达上限
3. 查 Supabase `coupon_uses` 表，确认该 email + coupon_code 组合不存在
4. 返回折扣预览

**Response (success):**
```json
{
  "valid": true,
  "discount": { "type": "percent", "value": 10 },
  "promotion_code_id": "promo_xxx",
  "message": "立省 10%"
}
```

**Response (fail):**
```json
{ "valid": false, "error": "折扣码无效" }
```

---

#### `POST /api/checkout`
创建带折扣的 Stripe Checkout Session。

**Request body:**
```json
{
  "price_id": "price_xxx",
  "promotion_code_id": "promo_xxx",
  "email": "user@example.com"
}
```

**Logic:**
1. 调 `stripe.checkout.sessions.create()`，传入 `line_items`、`discounts: [{ promotion_code }]`、`customer_email`、`success_url`、`cancel_url`
2. 返回 session URL

**Response:**
```json
{ "url": "https://checkout.stripe.com/..." }
```

---

#### `POST /api/admin/coupon`
创建折扣券（仅管理员）。

**Request body:**
```json
{
  "password": "...",
  "code": "SAVE10",
  "type": "percent",
  "value": 10,
  "max_uses": 100,
  "expires_at": "2026-12-31"
}
```

**Logic:**
1. 验证 `password === ADMIN_PASSWORD`
2. 调 `stripe.coupons.create()` 创建 Coupon（percent_off 或 amount_off）
3. 调 `stripe.promotionCodes.create({ coupon: couponId, code, max_redemptions, expires_at })`
4. 返回创建结果

---

#### `GET /api/admin/coupon`
列出所有 Promotion Codes（仅管理员，用 query param `?password=...`）。

**Logic:** 调 `stripe.promotionCodes.list({ limit: 50 })`，返回列表。

---

#### `POST /api/admin/coupon/deactivate`
停用折扣券。

**Request body:** `{ "password": "...", "promotion_code_id": "promo_xxx" }`

**Logic:** 调 `stripe.promotionCodes.update(id, { active: false })`

---

### 2. Supabase 新表

```sql
create table coupon_uses (
  id uuid primary key default gen_random_uuid(),
  coupon_code text not null,
  email text not null,
  session_id text,
  used_at timestamptz not null default now()
);

create unique index on coupon_uses (coupon_code, email);
```

用途：防止同一 email 重复使用同一折扣码。

---

### 3. 修改 `api/webhook.js`

在 `checkout.session.completed` 处理逻辑中，追加：若 session 有 `discounts` 字段，写入 `coupon_uses`：

```js
if (session.discounts?.length) {
  const code = session.discounts[0].promotion_code; // promotion_code id
  // 需要先查 promo code 拿到 code 字符串，或从 metadata 传入
  await supabase.from('coupon_uses').upsert({
    coupon_code: session.metadata?.coupon_code || code,
    email: customerEmail,
    session_id: session.id,
  }, { onConflict: 'coupon_code,email', ignoreDuplicates: true });
}
```

> 为此需在 `/api/checkout` 创建 session 时把 `coupon_code` 写入 `metadata`。

---

### 4. 修改 Catalog / 商品页面

在每个商品的购买按钮点击后，显示一个内联区块：

```
[ 折扣码输入框 ]  [ 应用 ]
✓ 已减 $10（验证成功后显示）
[ 前往结账 ]
```

**JS 流程：**
1. 点"应用" → `POST /api/coupon/validate`（需要用户邮箱：先检查是否已登录，已登录直接取，未登录提示输入）
2. 验证成功 → 显示折扣信息，存 `promotion_code_id`
3. 点"前往结账" → `POST /api/checkout` → 跳转 session URL

---

### 5. 修改 `admin.html`

在现有会员管理区块下方，新增两个区块：

**创建折扣券：**
- 折扣码（text input）
- 折扣类型（select: 百分比 / 固定金额）
- 折扣值（number input）
- 最大使用次数（number input）
- 到期日期（date input，可选）
- 提交按钮

**折扣券列表：**
- 点"刷新列表"按钮拉取当前所有券
- 每条显示：码、类型、折扣、已用/总次、到期、状态
- 停用按钮

---

## Data Flow Summary

```
Admin 创建券 → Stripe Coupon + Promotion Code
顾客输入码 → /api/coupon/validate → Stripe 验证 + Supabase per-email 检查
顾客结账 → /api/checkout → Stripe Checkout Session (with discount) → 跳转
支付完成 → webhook → coupon_uses 写入记录
```

---

## Error Cases

| 情况 | 响应 |
|------|------|
| 折扣码不存在 | `{ valid: false, error: "折扣码无效" }` |
| 已过期 | `{ valid: false, error: "折扣码已过期" }` |
| 已达总次数上限 | `{ valid: false, error: "折扣码已用完" }` |
| 该邮箱已用过 | `{ valid: false, error: "每人限用一次" }` |
| 无折扣直接结账 | `/api/checkout` 不传 promotion_code_id，正常结账 |

---

## Testing

每个端点写 Jest 单元测试，mock Stripe SDK 和 Supabase，覆盖：
- validate：有效 / 过期 / 超次数 / per-email 已用
- checkout：有折扣 / 无折扣
- admin/coupon：创建成功 / 密码错误
- webhook：有折扣写入 coupon_uses / 无折扣不写入
