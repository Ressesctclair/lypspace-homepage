jest.mock('stripe');
jest.mock('../../_lib/supabase', () => ({ getSupabase: jest.fn() }));

let Stripe, getSupabase, handler;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
  Stripe = require('stripe');
  ({ getSupabase } = require('../../_lib/supabase'));
  handler = require('../../coupon/validate');
});

afterEach(() => { delete process.env.STRIPE_SECRET_KEY; });

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn(), end: jest.fn() });

function mockStripe(promoCodeOrNull) {
  Stripe.mockReturnValue({
    promotionCodes: {
      list: jest.fn().mockResolvedValue({ data: promoCodeOrNull ? [promoCodeOrNull] : [] }),
    },
  });
}

function mockSupabase(existingRow) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: existingRow });
  const eqEmail = jest.fn().mockReturnValue({ maybeSingle });
  const eqCode = jest.fn().mockReturnValue({ eq: eqEmail });
  const select = jest.fn().mockReturnValue({ eq: eqCode });
  getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ select }) });
}

test('returns 405 for non-POST', async () => {
  const res = makeRes();
  await handler({ method: 'GET', body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});

test('returns 400 when code or email missing', async () => {
  Stripe.mockReturnValue({});
  const res = makeRes();
  await handler({ method: 'POST', body: { code: 'SAVE10' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: 'code and email required' });
});

test('returns invalid for unknown code', async () => {
  mockStripe(null);
  const res = makeRes();
  await handler({ method: 'POST', body: { code: 'FAKE', email: 'a@b.com' } }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ valid: false, error: '折扣码无效' });
});

test('returns invalid for expired code', async () => {
  mockStripe({
    id: 'promo_x', active: true,
    expires_at: 1000, max_redemptions: null, times_redeemed: 0,
    coupon: { percent_off: 10, amount_off: null },
  });
  const res = makeRes();
  await handler({ method: 'POST', body: { code: 'OLD', email: 'a@b.com' } }, res);
  expect(res.json).toHaveBeenCalledWith({ valid: false, error: '折扣码已过期' });
});

test('returns invalid when max redemptions reached', async () => {
  mockStripe({
    id: 'promo_x', active: true,
    expires_at: null, max_redemptions: 10, times_redeemed: 10,
    coupon: { percent_off: 10, amount_off: null },
  });
  const res = makeRes();
  await handler({ method: 'POST', body: { code: 'FULL', email: 'a@b.com' } }, res);
  expect(res.json).toHaveBeenCalledWith({ valid: false, error: '折扣码已用完' });
});

test('returns invalid when this email already used code', async () => {
  mockStripe({
    id: 'promo_x', active: true,
    expires_at: null, max_redemptions: null, times_redeemed: 0,
    coupon: { percent_off: 10, amount_off: null },
  });
  mockSupabase({ id: 'use_existing' });
  const res = makeRes();
  await handler({ method: 'POST', body: { code: 'SAVE10', email: 'used@b.com' } }, res);
  expect(res.json).toHaveBeenCalledWith({ valid: false, error: '每人限用一次' });
});

test('returns valid with percent discount', async () => {
  mockStripe({
    id: 'promo_p', active: true,
    expires_at: null, max_redemptions: null, times_redeemed: 0,
    coupon: { percent_off: 10, amount_off: null },
  });
  mockSupabase(null);
  const res = makeRes();
  await handler({ method: 'POST', body: { code: 'SAVE10', email: 'new@b.com' } }, res);
  expect(res.json).toHaveBeenCalledWith({
    valid: true,
    discount: { type: 'percent', value: 10 },
    promotion_code_id: 'promo_p',
    message: '立省 10%',
  });
});

test('returns valid with amount discount', async () => {
  mockStripe({
    id: 'promo_a', active: true,
    expires_at: null, max_redemptions: null, times_redeemed: 0,
    coupon: { percent_off: null, amount_off: 1000, currency: 'usd' },
  });
  mockSupabase(null);
  const res = makeRes();
  await handler({ method: 'POST', body: { code: 'OFF10', email: 'new@b.com' } }, res);
  expect(res.json).toHaveBeenCalledWith({
    valid: true,
    discount: { type: 'amount', value: 10, currency: 'usd' },
    promotion_code_id: 'promo_a',
    message: '立省 USD 10.00',
  });
});

test('code lookup is case-insensitive (uppercased before Stripe query)', async () => {
  const mockList = jest.fn().mockResolvedValue({ data: [] });
  Stripe.mockReturnValue({ promotionCodes: { list: mockList } });
  const res = makeRes();
  await handler({ method: 'POST', body: { code: 'save10', email: 'a@b.com' } }, res);
  expect(mockList).toHaveBeenCalledWith({ code: 'SAVE10', limit: 1, active: true });
});
