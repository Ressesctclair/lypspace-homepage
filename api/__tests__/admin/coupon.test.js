jest.mock('stripe');
let Stripe, handler;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.ADMIN_PASSWORD = 'admin-secret';
  process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
  Stripe = require('stripe');
  handler = require('../../admin/coupon');
});

afterEach(() => {
  delete process.env.ADMIN_PASSWORD;
  delete process.env.STRIPE_SECRET_KEY;
});

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn(), end: jest.fn() });

// --- GET (list) ---

test('GET returns 401 for wrong password', async () => {
  Stripe.mockReturnValue({});
  const res = makeRes();
  await handler({ method: 'GET', query: { password: 'wrong' } }, res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
});

test('GET returns coupon list', async () => {
  const mockList = jest.fn().mockResolvedValue({
    data: [{
      id: 'promo_aaa',
      code: 'SAVE10',
      active: true,
      coupon: { percent_off: 10, amount_off: null, currency: null },
      max_redemptions: 100,
      times_redeemed: 5,
      expires_at: null,
    }],
  });
  Stripe.mockReturnValue({ promotionCodes: { list: mockList } });
  const res = makeRes();
  await handler({ method: 'GET', query: { password: 'admin-secret' } }, res);
  expect(mockList).toHaveBeenCalledWith({ limit: 50, expand: ['data.coupon'] });
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({
    coupons: [{
      id: 'promo_aaa',
      code: 'SAVE10',
      active: true,
      discount: { type: 'percent', value: 10 },
      max_uses: 100,
      used: 5,
      expires_at: null,
    }],
  });
});

test('GET maps amount coupon correctly', async () => {
  const mockList = jest.fn().mockResolvedValue({
    data: [{
      id: 'promo_bbb',
      code: 'OFF10',
      active: true,
      coupon: { percent_off: null, amount_off: 1000, currency: 'usd' },
      max_redemptions: null,
      times_redeemed: 0,
      expires_at: 1800000000,
    }],
  });
  Stripe.mockReturnValue({ promotionCodes: { list: mockList } });
  const res = makeRes();
  await handler({ method: 'GET', query: { password: 'admin-secret' } }, res);
  expect(res.json).toHaveBeenCalledWith({
    coupons: [{
      id: 'promo_bbb',
      code: 'OFF10',
      active: true,
      discount: { type: 'amount', value: 10, currency: 'usd' },
      max_uses: null,
      used: 0,
      expires_at: 1800000000,
    }],
  });
});

// --- POST (create) ---

test('POST returns 401 for wrong password', async () => {
  Stripe.mockReturnValue({});
  const res = makeRes();
  await handler({ method: 'POST', body: { password: 'wrong', code: 'SAVE10', type: 'percent', value: 10 } }, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

test('POST returns 400 for missing fields', async () => {
  Stripe.mockReturnValue({});
  const res = makeRes();
  await handler({ method: 'POST', body: { password: 'admin-secret', code: 'SAVE10' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: 'code, type, value required' });
});

test('POST returns 400 for invalid type', async () => {
  Stripe.mockReturnValue({});
  const res = makeRes();
  await handler({ method: 'POST', body: { password: 'admin-secret', code: 'SAVE10', type: 'bad', value: 10 } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: 'type must be percent or amount' });
});

test('POST creates percent coupon and uppercases code', async () => {
  const mockCouponCreate = jest.fn().mockResolvedValue({ id: 'coup_x' });
  const mockPromoCreate = jest.fn().mockResolvedValue({ id: 'promo_x', code: 'SAVE10' });
  Stripe.mockReturnValue({
    coupons: { create: mockCouponCreate },
    promotionCodes: { create: mockPromoCreate },
  });
  const res = makeRes();
  await handler({ method: 'POST', body: { password: 'admin-secret', code: 'save10', type: 'percent', value: 10, max_uses: 100 } }, res);
  expect(mockCouponCreate).toHaveBeenCalledWith({ percent_off: 10, duration: 'once' });
  expect(mockPromoCreate).toHaveBeenCalledWith({ coupon: 'coup_x', code: 'SAVE10', max_redemptions: 100 });
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json).toHaveBeenCalledWith({ created: true, id: 'promo_x', code: 'SAVE10' });
});

test('POST creates amount coupon in cents', async () => {
  const mockCouponCreate = jest.fn().mockResolvedValue({ id: 'coup_y' });
  const mockPromoCreate = jest.fn().mockResolvedValue({ id: 'promo_y', code: 'OFF10' });
  Stripe.mockReturnValue({
    coupons: { create: mockCouponCreate },
    promotionCodes: { create: mockPromoCreate },
  });
  const res = makeRes();
  await handler({ method: 'POST', body: { password: 'admin-secret', code: 'off10', type: 'amount', value: 10 } }, res);
  expect(mockCouponCreate).toHaveBeenCalledWith({ amount_off: 1000, currency: 'usd', duration: 'once' });
  expect(mockPromoCreate).toHaveBeenCalledWith({ coupon: 'coup_y', code: 'OFF10' });
  expect(res.status).toHaveBeenCalledWith(201);
});

test('POST includes expires_at as unix timestamp when provided', async () => {
  const mockCouponCreate = jest.fn().mockResolvedValue({ id: 'coup_z' });
  const mockPromoCreate = jest.fn().mockResolvedValue({ id: 'promo_z', code: 'XMAS' });
  Stripe.mockReturnValue({
    coupons: { create: mockCouponCreate },
    promotionCodes: { create: mockPromoCreate },
  });
  const res = makeRes();
  await handler({ method: 'POST', body: { password: 'admin-secret', code: 'xmas', type: 'percent', value: 20, expires_at: '2026-12-31' } }, res);
  expect(mockPromoCreate).toHaveBeenCalledWith(expect.objectContaining({
    expires_at: Math.floor(new Date('2026-12-31').getTime() / 1000),
  }));
});

test('returns 405 for other methods', async () => {
  Stripe.mockReturnValue({ promotionCodes: { update: jest.fn() } });
  const res = makeRes();
  await handler({ method: 'PATCH', body: {}, query: {} }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});
