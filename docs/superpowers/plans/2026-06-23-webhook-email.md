# Stripe Webhook + Resend 邮件系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 lypspace-homepage 添加 Stripe webhook 处理和 Resend 邮件发送，实现付款后自动发订单确认邮件、商家手动触发物流通知邮件。

**Architecture:** 在现有静态 HTML 项目中添加 Vercel Serverless Functions（`/api` 目录）。`api/webhook.js` 接收 Stripe 的 `checkout.session.completed` 事件并发送订单确认邮件；`api/ship.js` 提供密码保护的端点供商家触发物流通知邮件；`admin.html` 是商家操作界面。

**Tech Stack:** Node.js (Vercel Functions), stripe@^17, resend@^4, Jest@^29

## Global Constraints

- Node.js >= 18
- 所有环境变量只存在 Vercel Dashboard 中，不提交到 Git
- `.gitignore` 必须包含 `node_modules/` 和 `.env`
- 发件地址变量 `FROM_EMAIL`，测试期间用 `onboarding@resend.dev`，正式用 `LYP SPACE <orders@lypspace.digital>`
- 测试文件放在 `api/__tests__/` 目录

---

### Task 1: 项目初始化

**Files:**
- Create: `package.json`
- Create: `vercel.json`
- Create: `.gitignore`

**Interfaces:**
- Produces: npm 依赖可安装，Vercel 识别 `/api` 目录为 serverless functions

- [ ] **Step 1: 创建 package.json**

路径：`/Users/loren/Desktop/lypspace-clone/package.json`

```json
{
  "name": "lypspace-homepage",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "resend": "^4.0.0",
    "stripe": "^17.0.0"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/api/__tests__/**/*.test.js"]
  }
}
```

- [ ] **Step 2: 创建 vercel.json**

路径：`/Users/loren/Desktop/lypspace-clone/vercel.json`

```json
{
  "version": 2,
  "functions": {
    "api/*.js": {
      "memory": 128,
      "maxDuration": 10
    }
  }
}
```

- [ ] **Step 3: 创建 .gitignore**

路径：`/Users/loren/Desktop/lypspace-clone/.gitignore`

```
node_modules/
.env
.env.local
.vercel
```

- [ ] **Step 4: 安装依赖**

```bash
cd /Users/loren/Desktop/lypspace-clone && npm install
```

Expected: `node_modules/` 创建，`package-lock.json` 生成，无报错。

- [ ] **Step 5: 创建测试目录**

```bash
mkdir -p /Users/loren/Desktop/lypspace-clone/api/__tests__
```

- [ ] **Step 6: Commit**

```bash
cd /Users/loren/Desktop/lypspace-clone
git add package.json package-lock.json vercel.json .gitignore
git commit -m "chore: add package.json, vercel config, gitignore"
```

---

### Task 2: Webhook 处理器

**Files:**
- Create: `api/webhook.js`
- Create: `api/__tests__/webhook.test.js`

**Interfaces:**
- Produces: `POST /api/webhook` — 验证 Stripe 签名，处理 `checkout.session.completed`，发订单确认邮件，返回 `{ received: true }`

- [ ] **Step 1: 创建测试文件**

路径：`/Users/loren/Desktop/lypspace-clone/api/__tests__/webhook.test.js`

```js
const { Readable } = require('stream');

jest.mock('stripe');
jest.mock('resend');

const Stripe = require('stripe');
const { Resend } = require('resend');

let handler;
let mockConstructEvent;
let mockEmailSend;

beforeEach(() => {
  jest.resetModules();
  mockEmailSend = jest.fn().mockResolvedValue({ id: 'email-123' });
  mockConstructEvent = jest.fn();
  Resend.mockImplementation(() => ({ emails: { send: mockEmailSend } }));
  Stripe.mockImplementation(() => ({ webhooks: { constructEvent: mockConstructEvent } }));
  handler = require('../webhook');
});

afterEach(() => jest.clearAllMocks());

const makeReq = (body, method = 'POST') => {
  const buf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const req = new Readable({ read() {} });
  req.method = method;
  req.headers = { 'stripe-signature': 'test-sig-123' };
  req.push(buf);
  req.push(null);
  return req;
};

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

test('rejects non-POST with 405', async () => {
  const req = makeReq('{}', 'GET');
  const res = makeRes();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(405);
  expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
});

test('rejects invalid Stripe signature with 400', async () => {
  mockConstructEvent.mockImplementation(() => { throw new Error('Invalid signature'); });
  const req = makeReq('{}');
  const res = makeRes();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ error: expect.stringContaining('Webhook Error') })
  );
});

test('sends order confirmation email on checkout.session.completed', async () => {
  const session = {
    id: 'cs_test_abc123',
    customer_details: { email: 'customer@test.com', name: 'Test User' },
    amount_total: 9760,
    currency: 'usd',
  };
  mockConstructEvent.mockReturnValue({
    type: 'checkout.session.completed',
    data: { object: session },
  });
  const req = makeReq(JSON.stringify(session));
  const res = makeRes();
  await handler(req, res);
  expect(mockEmailSend).toHaveBeenCalledWith(
    expect.objectContaining({
      to: 'customer@test.com',
      subject: '订单确认 - LYP SPACE',
    })
  );
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ received: true });
});

test('returns 200 without sending email for other event types', async () => {
  mockConstructEvent.mockReturnValue({ type: 'payment_intent.created', data: { object: {} } });
  const req = makeReq('{}');
  const res = makeRes();
  await handler(req, res);
  expect(mockEmailSend).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(200);
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/loren/Desktop/lypspace-clone && npm test -- webhook
```

Expected: `FAIL` — `Cannot find module '../webhook'`

- [ ] **Step 3: 创建 api/webhook.js**

路径：`/Users/loren/Desktop/lypspace-clone/api/webhook.js`

```js
const Stripe = require('stripe');
const { Resend } = require('resend');

const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';

const getRawBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

module.exports = async (req, res) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const resend = new Resend(process.env.RESEND_API_KEY);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = session.customer_details?.email;
    const customerName = session.customer_details?.name || '亲爱的客户';
    const amount = ((session.amount_total || 0) / 100).toFixed(2);
    const currency = (session.currency || 'USD').toUpperCase();
    const orderId = session.id;

    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: customerEmail,
        subject: '订单确认 - LYP SPACE',
        html: `
          <div style="font-family:Helvetica Neue,Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;padding:40px 0;">
            <h2 style="font-weight:400;letter-spacing:0.04em;margin-bottom:24px;">感谢您的购买</h2>
            <p style="margin-bottom:16px;">您好 ${customerName}，</p>
            <p style="margin-bottom:24px;">我们已收到您的订单，正在为您精心准备发货。</p>
            <table style="width:100%;border-collapse:collapse;margin:24px 0;border-top:1px solid #e0e0e0;">
              <tr>
                <td style="padding:12px 0;color:#6b6b6b;border-bottom:1px solid #e0e0e0;">订单编号</td>
                <td style="padding:12px 0;border-bottom:1px solid #e0e0e0;">${orderId}</td>
              </tr>
              <tr>
                <td style="padding:12px 0;color:#6b6b6b;">订单金额</td>
                <td style="padding:12px 0;">${currency} ${amount}</td>
              </tr>
            </table>
            <p style="margin-bottom:40px;">我们会在发货后再次发送物流信息，请留意邮件。</p>
            <p style="color:#6b6b6b;font-size:12px;border-top:1px solid #e0e0e0;padding-top:24px;">LYP SPACE</p>
          </div>
        `,
      });
    } catch (err) {
      console.error('Failed to send order confirmation:', err.message);
    }
  }

  return res.status(200).json({ received: true });
};
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd /Users/loren/Desktop/lypspace-clone && npm test -- webhook
```

Expected:
```
PASS api/__tests__/webhook.test.js
  ✓ rejects non-POST with 405
  ✓ rejects invalid Stripe signature with 400
  ✓ sends order confirmation email on checkout.session.completed
  ✓ returns 200 without sending email for other event types
```

- [ ] **Step 5: Commit**

```bash
cd /Users/loren/Desktop/lypspace-clone
git add api/webhook.js api/__tests__/webhook.test.js
git commit -m "feat: add Stripe webhook handler with order confirmation email"
```

---

### Task 3: 物流通知端点

**Files:**
- Create: `api/ship.js`
- Create: `api/__tests__/ship.test.js`

**Interfaces:**
- Produces: `POST /api/ship` — body: `{ password, customerEmail, trackingNumber, carrier, orderRef? }` → `{ sent: true }` 或 error JSON

- [ ] **Step 1: 创建测试文件**

路径：`/Users/loren/Desktop/lypspace-clone/api/__tests__/ship.test.js`

```js
const { Readable } = require('stream');

jest.mock('resend');
const { Resend } = require('resend');

let handler;
let mockEmailSend;

beforeEach(() => {
  jest.resetModules();
  process.env.ADMIN_PASSWORD = 'test-admin-pass-123';
  mockEmailSend = jest.fn().mockResolvedValue({ id: 'email-456' });
  Resend.mockImplementation(() => ({ emails: { send: mockEmailSend } }));
  handler = require('../ship');
});

afterEach(() => {
  jest.clearAllMocks();
  delete process.env.ADMIN_PASSWORD;
});

const makeReq = (body, method = 'POST') => {
  const req = new Readable({ read() {} });
  req.method = method;
  req.headers = { 'content-type': 'application/json' };
  req.push(JSON.stringify(body));
  req.push(null);
  return req;
};

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const validBody = {
  password: 'test-admin-pass-123',
  customerEmail: 'buyer@test.com',
  carrier: '顺丰',
  trackingNumber: 'SF1234567890',
  orderRef: 'ORDER-001',
};

test('rejects non-POST with 405', async () => {
  const req = makeReq(validBody, 'GET');
  const res = makeRes();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(405);
});

test('rejects wrong password with 401', async () => {
  const req = makeReq({ ...validBody, password: 'wrong' });
  const res = makeRes();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(mockEmailSend).not.toHaveBeenCalled();
});

test('rejects missing required fields with 400', async () => {
  const req = makeReq({ password: 'test-admin-pass-123', customerEmail: 'buyer@test.com' });
  const res = makeRes();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockEmailSend).not.toHaveBeenCalled();
});

test('sends shipping notification with correct data', async () => {
  const req = makeReq(validBody);
  const res = makeRes();
  await handler(req, res);
  expect(mockEmailSend).toHaveBeenCalledWith(
    expect.objectContaining({
      to: 'buyer@test.com',
      subject: '您的订单已发货 - LYP SPACE',
      html: expect.stringContaining('SF1234567890'),
    })
  );
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ sent: true });
});

test('includes carrier tracking link in email', async () => {
  const req = makeReq(validBody);
  const res = makeRes();
  await handler(req, res);
  const html = mockEmailSend.mock.calls[0][0].html;
  expect(html).toContain('SF1234567890');
  expect(html).toContain('sf-express.com');
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/loren/Desktop/lypspace-clone && npm test -- ship
```

Expected: `FAIL` — `Cannot find module '../ship'`

- [ ] **Step 3: 创建 api/ship.js**

路径：`/Users/loren/Desktop/lypspace-clone/api/ship.js`

```js
const { Resend } = require('resend');

const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';

const CARRIER_LINKS = {
  顺丰: 'https://www.sf-express.com/cn/sc/dynamic_function/waybill/#search/bill-number/',
  中通: 'https://www.zto.com/express/waybilltracking.html?bill_codes=',
  圆通: 'https://www.yto.net.cn/express/index.html?no=',
  申通: 'https://www.sto.cn/query-result.html?mailno=',
  韵达: 'https://www.yundaex.com/cn/index.php?number=',
  邮政EMS: 'http://www.ems.com.cn/queryList.html?mailNum=',
  其他: 'https://www.kuaidi100.com/?nu=',
};

const getBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });

module.exports = async (req, res) => {
  const resend = new Resend(process.env.RESEND_API_KEY);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;
  try {
    body = await getBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { password, customerEmail, trackingNumber, carrier, orderRef } = body;

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!customerEmail || !trackingNumber || !carrier) {
    return res.status(400).json({
      error: 'Missing required fields: customerEmail, trackingNumber, carrier',
    });
  }

  const trackingBase = CARRIER_LINKS[carrier] || CARRIER_LINKS['其他'];
  const trackingUrl = `${trackingBase}${trackingNumber}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: customerEmail,
      subject: '您的订单已发货 - LYP SPACE',
      html: `
        <div style="font-family:Helvetica Neue,Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;padding:40px 0;">
          <h2 style="font-weight:400;letter-spacing:0.04em;margin-bottom:24px;">您的订单已发货</h2>
          <p style="margin-bottom:24px;">您好，您的包裹已经发出，请注意查收。</p>
          <table style="width:100%;border-collapse:collapse;margin:24px 0;border-top:1px solid #e0e0e0;">
            ${orderRef ? `<tr><td style="padding:12px 0;color:#6b6b6b;border-bottom:1px solid #e0e0e0;">订单参考</td><td style="padding:12px 0;border-bottom:1px solid #e0e0e0;">${orderRef}</td></tr>` : ''}
            <tr><td style="padding:12px 0;color:#6b6b6b;border-bottom:1px solid #e0e0e0;">快递公司</td><td style="padding:12px 0;border-bottom:1px solid #e0e0e0;">${carrier}</td></tr>
            <tr><td style="padding:12px 0;color:#6b6b6b;">快递单号</td><td style="padding:12px 0;">${trackingNumber}</td></tr>
          </table>
          <a href="${trackingUrl}" style="display:inline-block;padding:12px 28px;background:#111;color:#fff;text-decoration:none;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">查看物流</a>
          <p style="margin-top:40px;color:#6b6b6b;font-size:12px;border-top:1px solid #e0e0e0;padding-top:24px;">LYP SPACE</p>
        </div>
      `,
    });
    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('Failed to send shipping notification:', err.message);
    return res.status(500).json({ error: 'Failed to send email' });
  }
};
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd /Users/loren/Desktop/lypspace-clone && npm test -- ship
```

Expected:
```
PASS api/__tests__/ship.test.js
  ✓ rejects non-POST with 405
  ✓ rejects wrong password with 401
  ✓ rejects missing required fields with 400
  ✓ sends shipping notification with correct data
  ✓ includes carrier tracking link in email
```

- [ ] **Step 5: Commit**

```bash
cd /Users/loren/Desktop/lypspace-clone
git add api/ship.js api/__tests__/ship.test.js
git commit -m "feat: add shipping notification endpoint"
```

---

### Task 4: 发货管理页面

**Files:**
- Create: `admin.html`

**Interfaces:**
- Consumes: `POST /api/ship` — 定义于 Task 3

- [ ] **Step 1: 创建 admin.html**

路径：`/Users/loren/Desktop/lypspace-clone/admin.html`

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>发货管理 - LYP SPACE</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Helvetica Neue, Arial, sans-serif;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card { background: #fff; padding: 48px; width: 100%; max-width: 480px; }
    h1 { font-size: 15px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 32px; }
    label { display: block; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #6b6b6b; margin-top: 20px; margin-bottom: 6px; }
    input, select {
      width: 100%; padding: 10px 12px; border: 1px solid #e0e0e0;
      font-size: 14px; font-family: inherit; outline: none; background: #fff; appearance: none;
    }
    input:focus, select:focus { border-color: #111; }
    button {
      margin-top: 32px; width: 100%; padding: 14px; background: #111; color: #fff;
      border: none; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase;
      font-family: inherit; cursor: pointer; transition: background 0.2s;
    }
    button:hover:not(:disabled) { background: #333; }
    button:disabled { background: #999; cursor: not-allowed; }
    .msg { margin-top: 16px; font-size: 13px; text-align: center; min-height: 20px; }
    .msg.ok { color: #2a7a2a; }
    .msg.err { color: #c0392b; }
  </style>
</head>
<body>
  <div class="card">
    <h1>发货通知</h1>
    <form id="form">
      <label>管理员密码</label>
      <input type="password" id="password" required placeholder="••••••••" autocomplete="current-password" />

      <label>客户邮箱</label>
      <input type="email" id="customerEmail" required placeholder="customer@example.com" />

      <label>快递公司</label>
      <select id="carrier" required>
        <option value="">请选择快递公司</option>
        <option>顺丰</option>
        <option>中通</option>
        <option>圆通</option>
        <option>申通</option>
        <option>韵达</option>
        <option>邮政EMS</option>
        <option>其他</option>
      </select>

      <label>快递单号</label>
      <input type="text" id="trackingNumber" required placeholder="SF1234567890" />

      <label>订单备注（可选）</label>
      <input type="text" id="orderRef" placeholder="订单编号或备注" />

      <button type="submit" id="btn">发送物流通知</button>
      <div class="msg" id="msg"></div>
    </form>
  </div>

  <script>
    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn');
      const msg = document.getElementById('msg');
      btn.disabled = true;
      btn.textContent = '发送中...';
      msg.textContent = '';
      msg.className = 'msg';

      try {
        const res = await fetch('/api/ship', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password: document.getElementById('password').value,
            customerEmail: document.getElementById('customerEmail').value,
            carrier: document.getElementById('carrier').value,
            trackingNumber: document.getElementById('trackingNumber').value,
            orderRef: document.getElementById('orderRef').value,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          msg.textContent = '✓ 物流通知已发送至客户邮箱';
          msg.classList.add('ok');
          document.getElementById('customerEmail').value = '';
          document.getElementById('carrier').value = '';
          document.getElementById('trackingNumber').value = '';
          document.getElementById('orderRef').value = '';
        } else {
          msg.textContent = data.error || '发送失败，请重试';
          msg.classList.add('err');
        }
      } catch {
        msg.textContent = '网络错误，请检查连接后重试';
        msg.classList.add('err');
      }

      btn.disabled = false;
      btn.textContent = '发送物流通知';
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: 本地验证页面**

```bash
open /Users/loren/Desktop/lypspace-clone/admin.html
```

检查：表单渲染正确，6 个字段可填写，快递公司下拉有 7 个选项，按钮样式与主站一致。

- [ ] **Step 3: Commit**

```bash
cd /Users/loren/Desktop/lypspace-clone
git add admin.html
git commit -m "feat: add shipping admin page"
```

---

### Task 5: 环境变量 + 部署 + 验收

**Files:**
- 修改：Vercel Dashboard 环境变量（浏览器操作）
- 修改：Stripe Dashboard Webhook 配置（浏览器操作）

- [ ] **Step 1: 推送代码，触发自动部署**

```bash
cd /Users/loren/Desktop/lypspace-clone && git push origin main
```

等待 Vercel 部署完成（约 1 分钟）。打开 `vercel.com` 确认 `lypspace-homepage` 状态为 **Ready**。

- [ ] **Step 2: 在 Vercel 添加环境变量**

打开 `vercel.com` → `lypspace-homepage` → **Settings** → **Environment Variables**

添加以下 4 个变量（Environments 全选 Production + Preview + Development）：

| Name | Value 来源 |
|------|-----------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → Secret key（`sk_live_...` 或测试用 `sk_test_...`）|
| `RESEND_API_KEY` | Resend Dashboard → API Keys → Create API Key |
| `ADMIN_PASSWORD` | 自定义强密码（记录在安全地方，如 1Password）|
| `FROM_EMAIL` | 测试期间填 `onboarding@resend.dev`；正式上线后填 `LYP SPACE <orders@lypspace.digital>`（需先在 Resend 验证域名）|

- [ ] **Step 3: 在 Stripe 配置 Webhook**

1. 打开 `dashboard.stripe.com` → **Developers** → **Webhooks** → **Add endpoint**
2. Endpoint URL 填：`https://lypspace-homepage.vercel.app/api/webhook`
3. 点击 **Select events** → 搜索并勾选 `checkout.session.completed`
4. 点击 **Add endpoint**
5. 复制页面显示的 **Signing secret**（`whsec_...`）
6. 回到 Vercel Dashboard → Environment Variables → 添加 `STRIPE_WEBHOOK_SECRET` = 刚复制的值

- [ ] **Step 4: 重新部署使环境变量生效**

Vercel Dashboard → `lypspace-homepage` → **Deployments** → 最新一条 → 右侧 `...` → **Redeploy**

等待状态变为 **Ready**。

- [ ] **Step 5: 测试订单确认邮件**

1. Stripe Dashboard → Developers → Webhooks → 点击刚创建的 endpoint
2. 点击 **Send test webhook** → 选 `checkout.session.completed`
3. 编辑 payload，将 `customer_details.email` 改为你的真实邮箱
4. 点击 **Send test webhook**
5. 检查邮箱，应收到标题为"订单确认 - LYP SPACE"的邮件

- [ ] **Step 6: 测试物流通知邮件**

1. 打开 `https://lypspace-homepage.vercel.app/admin`
2. 填入 `ADMIN_PASSWORD` 环境变量设置的密码
3. 填入你的真实邮箱作为客户邮箱
4. 选择快递公司，填入任意快递单号（如 `SF1234567890`）
5. 点击**发送物流通知**
6. 检查邮箱，应收到标题为"您的订单已发货 - LYP SPACE"的邮件，点击"查看物流"确认链接正确
