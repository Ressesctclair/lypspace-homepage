jest.mock('stripe');
jest.mock('../_lib/supabase', () => ({ getSupabase: jest.fn() }));
let Stripe, handler, getSupabase;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
  process.env.SITE_URL = 'https://example.com';
  Stripe = require('stripe');
  getSupabase = require('../_lib/supabase').getSupabase;
  getSupabase.mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: { is_member: false } }),
        }),
      }),
    }),
  });
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
  expect(res.json).toHaveBeenCalledWith({ error: 'price_id, items, or amount+product_name required' });
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

test('creates session with promotion code and uppercases coupon_code in metadata', async () => {
  const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/xyz' });
  Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
  const res = makeRes();
  await handler({
    method: 'POST',
    body: { price_id: 'price_xxx', email: 'a@b.com', promotion_code_id: 'promo_yyy', coupon_code: 'save10' },
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

describe('action=check-member', () => {
  test('returns 400 when email missing', async () => {
    Stripe.mockReturnValue({});
    const res = makeRes();
    await handler({ method: 'POST', body: { action: 'check-member' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'email required' });
  });

  test('returns is_member true for a member', async () => {
    Stripe.mockReturnValue({});
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: { is_member: true } }),
          }),
        }),
      }),
    });
    const res = makeRes();
    await handler({ method: 'POST', body: { action: 'check-member', email: 'member@test.com' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ is_member: true });
  });

  test('returns is_member false for a non-member', async () => {
    Stripe.mockReturnValue({});
    const res = makeRes();
    await handler({ method: 'POST', body: { action: 'check-member', email: 'nonmember@test.com' } }, res);
    expect(res.json).toHaveBeenCalledWith({ is_member: false });
  });

  test('returns is_member false when email not found', async () => {
    Stripe.mockReturnValue({});
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
    });
    const res = makeRes();
    await handler({ method: 'POST', body: { action: 'check-member', email: 'nobody@test.com' } }, res);
    expect(res.json).toHaveBeenCalledWith({ is_member: false });
  });
});

describe('member discount', () => {
  test('applies member coupon when email belongs to a member and no promo code given', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/member' });
    const mockRetrieve = jest.fn().mockResolvedValue({ id: 'member-5pct-off' });
    Stripe.mockReturnValue({
      checkout: { sessions: { create: mockCreate } },
      coupons: { retrieve: mockRetrieve, create: jest.fn() },
    });
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: { is_member: true } }),
          }),
        }),
      }),
    });
    const res = makeRes();
    await handler({ method: 'POST', body: { price_id: 'price_xxx', email: 'member@test.com' } }, res);
    expect(mockRetrieve).toHaveBeenCalledWith('member-5pct-off');
    const call = mockCreate.mock.calls[0][0];
    expect(call.discounts).toEqual([{ coupon: 'member-5pct-off' }]);
  });

  test('creates the member coupon when it does not exist yet', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/member2' });
    const mockCouponRetrieve = jest.fn().mockRejectedValue(new Error('No such coupon'));
    const mockCouponCreate = jest.fn().mockResolvedValue({ id: 'member-5pct-off' });
    Stripe.mockReturnValue({
      checkout: { sessions: { create: mockCreate } },
      coupons: { retrieve: mockCouponRetrieve, create: mockCouponCreate },
    });
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: { is_member: true } }),
          }),
        }),
      }),
    });
    const res = makeRes();
    await handler({ method: 'POST', body: { price_id: 'price_xxx', email: 'member@test.com' } }, res);
    expect(mockCouponCreate).toHaveBeenCalledWith({ id: 'member-5pct-off', percent_off: 5, duration: 'once' });
    const call = mockCreate.mock.calls[0][0];
    expect(call.discounts).toEqual([{ coupon: 'member-5pct-off' }]);
  });

  test('does not apply member coupon for a non-member', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/nonmember' });
    Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
    const res = makeRes();
    await handler({ method: 'POST', body: { price_id: 'price_xxx', email: 'nonmember@test.com' } }, res);
    const call = mockCreate.mock.calls[0][0];
    expect(call.discounts).toBeUndefined();
  });

  test('promotion code takes priority over member discount and skips the membership lookup', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/promo' });
    Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { price_id: 'price_xxx', email: 'member@test.com', promotion_code_id: 'promo_yyy' },
    }, res);
    expect(getSupabase).not.toHaveBeenCalled();
    const call = mockCreate.mock.calls[0][0];
    expect(call.discounts).toEqual([{ promotion_code: 'promo_yyy' }]);
  });
});
