jest.mock('stripe');
let Stripe, handler;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
  process.env.SITE_URL = 'https://example.com';
  Stripe = require('stripe');
  handler = require('../checkout');
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.SITE_URL;
});

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn(), end: jest.fn() });

test('returns 405 for non-POST', async () => {
  Stripe.mockReturnValue({});
  const res = makeRes();
  await handler({ method: 'GET', body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});

test('returns 400 when price_id missing', async () => {
  Stripe.mockReturnValue({});
  const res = makeRes();
  await handler({ method: 'POST', body: { email: 'a@b.com' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: 'price_id required' });
});

test('returns 400 when email missing', async () => {
  Stripe.mockReturnValue({});
  const res = makeRes();
  await handler({ method: 'POST', body: { price_id: 'price_xxx' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: 'email required' });
});

test('creates session without coupon', async () => {
  const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/abc' });
  Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
  const res = makeRes();
  await handler({ method: 'POST', body: { price_id: 'price_xxx', email: 'a@b.com' } }, res);
  const call = mockCreate.mock.calls[0][0];
  expect(call.line_items).toEqual([{ price: 'price_xxx', quantity: 1 }]);
  expect(call.customer_email).toBe('a@b.com');
  expect(call.mode).toBe('payment');
  expect(call.discounts).toBeUndefined();
  expect(call.metadata).toEqual({ coupon_code: '' });
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ url: 'https://checkout.stripe.com/abc' });
});

test('creates session with promotion code and coupon_code in metadata', async () => {
  const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/xyz' });
  Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
  const res = makeRes();
  await handler({
    method: 'POST',
    body: { price_id: 'price_xxx', email: 'a@b.com', promotion_code_id: 'promo_yyy', coupon_code: 'SAVE10' },
  }, res);
  const call = mockCreate.mock.calls[0][0];
  expect(call.discounts).toEqual([{ promotion_code: 'promo_yyy' }]);
  expect(call.metadata).toEqual({ coupon_code: 'SAVE10' });
  expect(res.json).toHaveBeenCalledWith({ url: 'https://checkout.stripe.com/xyz' });
});

test('success_url and cancel_url use SITE_URL', async () => {
  const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/u' });
  Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
  const res = makeRes();
  await handler({ method: 'POST', body: { price_id: 'price_xxx', email: 'a@b.com' } }, res);
  const call = mockCreate.mock.calls[0][0];
  expect(call.success_url).toBe('https://example.com/dashboard?checkout=success');
  expect(call.cancel_url).toBe('https://example.com/checkout');
});
