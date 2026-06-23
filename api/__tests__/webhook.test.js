const { Readable } = require('stream');

jest.mock('stripe');
jest.mock('resend');
jest.mock('../_lib/supabase', () => ({ getSupabase: jest.fn() }));

let Stripe;
let Resend;

let handler;
let mockConstructEvent;
let mockEmailSend;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  Stripe = require('stripe');
  ({ Resend } = require('resend'));
  mockEmailSend = jest.fn().mockResolvedValue({ id: 'email-123' });
  mockConstructEvent = jest.fn();
  Resend.mockImplementation(() => ({ emails: { send: mockEmailSend } }));
  Stripe.mockImplementation(() => ({ webhooks: { constructEvent: mockConstructEvent } }));
  const { getSupabase } = require('../_lib/supabase');
  const mockUpsert = jest.fn().mockResolvedValue({});
  getSupabase.mockReturnValue({
    from: jest.fn().mockReturnValue({ upsert: mockUpsert }),
  });
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

test('writes to order_links on checkout.session.completed', async () => {
  const session = {
    id: 'cs_test_abc123',
    metadata: { userId: 'user-uuid-123' },
    customer_details: { email: 'customer@test.com', name: 'Test User' },
    amount_total: 9760,
    currency: 'usd',
  };
  mockConstructEvent.mockReturnValue({
    type: 'checkout.session.completed',
    data: { object: session },
  });
  const { getSupabase } = require('../_lib/supabase');
  const mockUpsert = jest.fn().mockResolvedValue({});
  getSupabase.mockReturnValue({
    from: jest.fn().mockReturnValue({ upsert: mockUpsert }),
  });
  await handler(makeReq(JSON.stringify(session)), makeRes());
  expect(mockUpsert).toHaveBeenCalledWith(
    expect.objectContaining({ stripe_session_id: 'cs_test_abc123', customer_email: 'customer@test.com' }),
    { onConflict: 'stripe_session_id' }
  );
});

test('writes coupon_uses when session has metadata.coupon_code', async () => {
  const session = {
    id: 'cs_coupon_test',
    metadata: { coupon_code: 'SAVE10' },
    discounts: [{ promotion_code: 'promo_x' }],
    customer_details: { email: 'buyer@test.com', name: 'Buyer' },
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

  expect(mockFrom).toHaveBeenCalledWith('coupon_uses');
  expect(mockUpsert).toHaveBeenCalledWith(
    { coupon_code: 'SAVE10', email: 'buyer@test.com', session_id: 'cs_coupon_test' },
    { onConflict: 'coupon_code,email', ignoreDuplicates: true }
  );
});

test('does not write coupon_uses when session has coupon_code but no discounts', async () => {
  const session = {
    id: 'cs_no_discount',
    metadata: { coupon_code: 'SAVE10' },
    discounts: [],
    customer_details: { email: 'buyer@test.com', name: 'Buyer' },
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

  const couponFromCalls = mockFrom.mock.calls.filter(c => c[0] === 'coupon_uses');
  expect(couponFromCalls).toHaveLength(0);
});

test('does not write coupon_uses when metadata.coupon_code is empty', async () => {
  const session = {
    id: 'cs_no_coupon',
    metadata: { coupon_code: '' },
    customer_details: { email: 'buyer@test.com', name: 'Buyer' },
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

  const couponFromCalls = mockFrom.mock.calls.filter(c => c[0] === 'coupon_uses');
  expect(couponFromCalls).toHaveLength(0);
});
