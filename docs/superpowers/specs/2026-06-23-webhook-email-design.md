# Stripe Webhook + Resend 自动邮件系统设计

**日期**: 2026-06-23  
**状态**: 待实现  
**范围**: 第一阶段，共三阶段（后续：折扣码、用户登录）

---

## 目标

用户通过 Stripe Checkout 付款成功后：
1. 自动发送**订单确认邮件**给客户
2. 商家打包发货后，通过管理页手动触发**物流通知邮件**

---

## 架构

```
客户付款 → Stripe Checkout
         → checkout.session.completed webhook
         → /api/webhook.js
         → Resend → 订单确认邮件 → 客户邮箱

商家发货 → /admin.html（填快递单号）
         → /api/ship.js（密码验证）
         → Resend → 物流通知邮件 → 客户邮箱
```

---

## 文件结构

```
lypspace-clone/
├── index.html              （现有）
├── admin.html              （新增）
├── package.json            （新增）
└── api/
    ├── webhook.js          （新增）
    └── ship.js             （新增）
```

---

## 组件说明

### `api/webhook.js`
- 接收来自 Stripe 的 POST 请求
- 用 `stripe.webhooks.constructEvent()` 验证签名，防伪造请求
- 监听 `checkout.session.completed` 事件
- 从事件中提取：客户邮箱、客户姓名、订单金额、货币、订单 ID
- 调用 Resend 发送订单确认邮件
- 返回 200 OK（Stripe 需要此响应，否则会重试）

### `api/ship.js`
- 接收 POST 请求，body 包含：`password`、`customerEmail`、`trackingNumber`、`carrier`、`orderRef`
- 对比 `ADMIN_PASSWORD` 环境变量验证身份
- 调用 Resend 发送物流通知邮件
- 返回成功/失败 JSON

### `admin.html`
- 简单表单：客户邮箱、快递公司、快递单号、订单备注
- 提交前提示输入管理员密码
- 调用 `/api/ship`，显示发送结果

---

## 邮件内容

### 订单确认邮件
- **触发**: `checkout.session.completed`
- **收件人**: Stripe session 中的 `customer_details.email`
- **主题**: `订单确认 - LYP SPACE`
- **内容**: 客户姓名、订单编号、金额、"我们会尽快为您发货"

### 物流通知邮件
- **触发**: 商家在 admin 页手动提交
- **收件人**: 商家输入的客户邮箱
- **主题**: `您的订单已发货 - LYP SPACE`
- **内容**: 快递公司、快递单号、查件链接（根据快递公司自动生成）

---

## 环境变量

| 变量名 | 说明 | 存储位置 |
|--------|------|----------|
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard 生成的 webhook 签名密钥 | Vercel |
| `RESEND_API_KEY` | Resend 控制台的 API Key | Vercel |
| `ADMIN_PASSWORD` | 发货管理页密码，自定义 | Vercel |

---

## 依赖

```json
{
  "dependencies": {
    "stripe": "^17.0.0",
    "resend": "^4.0.0"
  }
}
```

---

## 错误处理

- Stripe 签名验证失败 → 返回 400，不发邮件
- Resend 发送失败 → 记录错误，仍返回 200 给 Stripe（避免重复触发）
- Admin 密码错误 → 返回 401
- 缺少必填字段 → 返回 400，提示具体字段

---

## Stripe 配置步骤（实现前需完成）

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://lypspace-homepage.vercel.app/api/webhook`
3. 监听事件: `checkout.session.completed`
4. 复制生成的 Webhook Signing Secret → 存入 Vercel 环境变量

---

## 后续阶段

- **第二阶段**: Stripe 折扣码 + 专属购买链接
- **第三阶段**: 用户注册/登录系统
