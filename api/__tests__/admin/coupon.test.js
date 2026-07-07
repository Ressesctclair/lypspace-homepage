jest.mock('stripe');
jest.mock('resend');
jest.mock('../../_lib/supabase', () => ({ getSupabase: jest.fn() }));
let Stripe, Resend, handler, getSupabase;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.ADMIN_PASSWORD = 'admin-secret';
  process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
  process.env.RESEND_API_KEY = 're_test_xxx';
  Stripe = require('stripe');
  ({ Resend } = require('resend'));
  getSupabase = require('../../_lib/supabase').getSupabase;
  handler = require('../../admin/coupon');
});

afterEach(() => {
  delete process.env.ADMIN_PASSWORD;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.RESEND_API_KEY;
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

describe('GET resource=orders', () => {
  test('returns 401 for wrong password', async () => {
    Stripe.mockReturnValue({});
    const res = makeRes();
    await handler({ method: 'GET', query: { resource: 'orders', password: 'wrong', email: 'a@b.com' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 400 when email missing', async () => {
    Stripe.mockReturnValue({});
    const res = makeRes();
    await handler({ method: 'GET', query: { resource: 'orders', password: 'admin-secret' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'email required' });
  });

  test('returns empty array when customer has no orders', async () => {
    Stripe.mockReturnValue({});
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [] }),
        }),
      }),
    });
    const res = makeRes();
    await handler({ method: 'GET', query: { resource: 'orders', password: 'admin-secret', email: 'a@b.com' } }, res);
    expect(res.json).toHaveBeenCalledWith({ orders: [] });
  });

  test('returns orders with refund_status "none" when nothing refunded', async () => {
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [{ stripe_session_id: 'cs_1' }] }),
        }),
      }),
    });
    const mockRetrieve = jest.fn().mockResolvedValue({
      created: 1700000000,
      amount_total: 12600,
      currency: 'usd',
      payment_intent: { latest_charge: { amount_refunded: 0, refunded: false } },
    });
    Stripe.mockReturnValue({ checkout: { sessions: { retrieve: mockRetrieve } } });
    const res = makeRes();
    await handler({ method: 'GET', query: { resource: 'orders', password: 'admin-secret', email: 'a@b.com' } }, res);
    expect(mockRetrieve).toHaveBeenCalledWith('cs_1', { expand: ['payment_intent.latest_charge'] });
    expect(res.json).toHaveBeenCalledWith({
      orders: [expect.objectContaining({ session_id: 'cs_1', amount: 12600, refund_status: 'none', amount_refunded: 0 })],
    });
  });

  test('returns refund_status "partial" when some but not all was refunded', async () => {
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [{ stripe_session_id: 'cs_2' }] }),
        }),
      }),
    });
    Stripe.mockReturnValue({
      checkout: {
        sessions: {
          retrieve: jest.fn().mockResolvedValue({
            created: 1700000000,
            amount_total: 20000,
            currency: 'usd',
            payment_intent: { latest_charge: { amount_refunded: 5000, refunded: false } },
          }),
        },
      },
    });
    const res = makeRes();
    await handler({ method: 'GET', query: { resource: 'orders', password: 'admin-secret', email: 'a@b.com' } }, res);
    expect(res.json).toHaveBeenCalledWith({
      orders: [expect.objectContaining({ refund_status: 'partial', amount_refunded: 5000 })],
    });
  });

  test('returns refund_status "full" when charge.refunded is true', async () => {
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [{ stripe_session_id: 'cs_3' }] }),
        }),
      }),
    });
    Stripe.mockReturnValue({
      checkout: {
        sessions: {
          retrieve: jest.fn().mockResolvedValue({
            created: 1700000000,
            amount_total: 8900,
            currency: 'usd',
            payment_intent: { latest_charge: { amount_refunded: 8900, refunded: true } },
          }),
        },
      },
    });
    const res = makeRes();
    await handler({ method: 'GET', query: { resource: 'orders', password: 'admin-secret', email: 'a@b.com' } }, res);
    expect(res.json).toHaveBeenCalledWith({
      orders: [expect.objectContaining({ refund_status: 'full', amount_refunded: 8900 })],
    });
  });

  test('skips order_links rows with null stripe_session_id (PayPal-only orders)', async () => {
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [
              { stripe_session_id: null },
              { stripe_session_id: 'cs_4' },
            ],
          }),
        }),
      }),
    });
    const mockRetrieve = jest.fn().mockResolvedValue({
      created: 1700000000,
      amount_total: 5000,
      currency: 'usd',
      payment_intent: { latest_charge: { amount_refunded: 0, refunded: false } },
    });
    Stripe.mockReturnValue({ checkout: { sessions: { retrieve: mockRetrieve } } });
    const res = makeRes();
    await handler({ method: 'GET', query: { resource: 'orders', password: 'admin-secret', email: 'a@b.com' } }, res);
    expect(mockRetrieve).toHaveBeenCalledTimes(1);
    expect(mockRetrieve).toHaveBeenCalledWith('cs_4', { expand: ['payment_intent.latest_charge'] });
    expect(res.json).toHaveBeenCalledWith({
      orders: [expect.objectContaining({ session_id: 'cs_4' })],
    });
  });
});

describe('POST resource=refund', () => {
  test('returns 401 for wrong password', async () => {
    Stripe.mockReturnValue({});
    const res = makeRes();
    await handler({ method: 'POST', query: { resource: 'refund' }, body: { password: 'wrong', session_id: 'cs_1' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 400 when session_id missing', async () => {
    Stripe.mockReturnValue({});
    const res = makeRes();
    await handler({ method: 'POST', query: { resource: 'refund' }, body: { password: 'admin-secret' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'session_id required' });
  });

  test('issues a full refund when amount is omitted, and emails the customer in English', async () => {
    const mockRetrieve = jest.fn().mockResolvedValue({
      payment_intent: 'pi_123',
      customer_details: { email: 'buyer@test.com' },
    });
    const mockRefundCreate = jest.fn().mockResolvedValue({ id: 're_1', amount: 12600, currency: 'usd', status: 'succeeded' });
    const mockEmailSend = jest.fn().mockResolvedValue({});
    Resend.mockImplementation(() => ({ emails: { send: mockEmailSend } }));
    Stripe.mockReturnValue({
      checkout: { sessions: { retrieve: mockRetrieve } },
      refunds: { create: mockRefundCreate },
    });
    const res = makeRes();
    await handler({ method: 'POST', query: { resource: 'refund' }, body: { password: 'admin-secret', session_id: 'cs_1' } }, res);
    expect(mockRefundCreate).toHaveBeenCalledWith({ payment_intent: 'pi_123' });
    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'buyer@test.com', subject: 'Refund Confirmation - LYP SPACE' })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ refunded: true, refund_id: 're_1', amount: 12600, status: 'succeeded' });
  });

  test('issues a partial refund, converting dollars to cents', async () => {
    const mockRetrieve = jest.fn().mockResolvedValue({ payment_intent: 'pi_456', customer_details: { email: 'buyer@test.com' } });
    const mockRefundCreate = jest.fn().mockResolvedValue({ id: 're_2', amount: 5000, currency: 'usd', status: 'succeeded' });
    Resend.mockImplementation(() => ({ emails: { send: jest.fn().mockResolvedValue({}) } }));
    Stripe.mockReturnValue({
      checkout: { sessions: { retrieve: mockRetrieve } },
      refunds: { create: mockRefundCreate },
    });
    const res = makeRes();
    await handler({ method: 'POST', query: { resource: 'refund' }, body: { password: 'admin-secret', session_id: 'cs_1', amount: 50 } }, res);
    expect(mockRefundCreate).toHaveBeenCalledWith({ payment_intent: 'pi_456', amount: 5000 });
  });

  test('surfaces the Stripe error message when the refund is rejected', async () => {
    const mockRetrieve = jest.fn().mockResolvedValue({ payment_intent: 'pi_789', customer_details: { email: 'buyer@test.com' } });
    const mockRefundCreate = jest.fn().mockRejectedValue(new Error('Refund amount is greater than unrefunded amount'));
    Stripe.mockReturnValue({
      checkout: { sessions: { retrieve: mockRetrieve } },
      refunds: { create: mockRefundCreate },
    });
    const res = makeRes();
    await handler({ method: 'POST', query: { resource: 'refund' }, body: { password: 'admin-secret', session_id: 'cs_1', amount: 999 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Refund amount is greater than unrefunded amount' });
  });

  test('still returns success when the confirmation email fails to send', async () => {
    const mockRetrieve = jest.fn().mockResolvedValue({ payment_intent: 'pi_999', customer_details: { email: 'buyer@test.com' } });
    const mockRefundCreate = jest.fn().mockResolvedValue({ id: 're_3', amount: 12600, currency: 'usd', status: 'succeeded' });
    Resend.mockImplementation(() => ({ emails: { send: jest.fn().mockRejectedValue(new Error('send failed')) } }));
    Stripe.mockReturnValue({
      checkout: { sessions: { retrieve: mockRetrieve } },
      refunds: { create: mockRefundCreate },
    });
    const res = makeRes();
    await handler({ method: 'POST', query: { resource: 'refund' }, body: { password: 'admin-secret', session_id: 'cs_1' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ refunded: true }));
  });
});
