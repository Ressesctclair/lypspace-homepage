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
  expect(call.metadata).toEqual({
    coupon_code: '',
    shipping_name: '', shipping_street: '', shipping_city: '',
    shipping_state: '', shipping_postal_code: '', shipping_country: '', shipping_phone: '',
  });
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
  expect(call.metadata).toEqual({
    coupon_code: 'SAVE10',
    shipping_name: '', shipping_street: '', shipping_city: '',
    shipping_state: '', shipping_postal_code: '', shipping_country: '', shipping_phone: '',
  });
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

describe('action=inventory', () => {
  test('includes product_overrides rows in the inventory map (regression)', async () => {
    Stripe.mockReturnValue({});
    getSupabase.mockReturnValue({
      from: jest.fn((table) => ({
        select: jest.fn().mockResolvedValue({
          data: table === 'product_overrides' ? [{ handle: 'dress-21', sale_price: 56 }] : [],
        }),
      })),
    });
    const res = makeRes();
    await handler({ method: 'GET', query: { action: 'inventory' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.inventory['dress-21']).toEqual({ handle: 'dress-21', sale_price: 56 });
  });

  test('includes custom_products sale_price in the inventory map', async () => {
    Stripe.mockReturnValue({});
    getSupabase.mockReturnValue({
      from: jest.fn((table) => ({
        select: jest.fn().mockResolvedValue({
          data: table === 'custom_products' ? [{ handle: 'floral-set', sale_price: 20 }] : [],
        }),
      })),
    });
    const res = makeRes();
    await handler({ method: 'GET', query: { action: 'inventory' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.inventory['floral-set']).toEqual(expect.objectContaining({ sale_price: 20 }));
  });
});

describe('sale price blocks stacking with promo/member discount', () => {
  test('ignores promotion_code_id when the single item handle is on sale', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/sale1' });
    Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
    getSupabase.mockReturnValue({
      from: jest.fn((table) => ({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            data: table === 'product_overrides' ? [{ sale_price: 56 }] : [],
          }),
        }),
      })),
    });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { price_id: 'price_xxx', email: 'a@b.com', handle: 'dress-21', promotion_code_id: 'promo_yyy' },
    }, res);
    const call = mockCreate.mock.calls[0][0];
    expect(call.discounts).toBeUndefined();
  });

  test('ignores member discount when a cart item handle is on sale', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/sale2' });
    Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
    getSupabase.mockReturnValue({
      from: jest.fn((table) => {
        if (table === 'users') {
          return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { is_member: true } }) }) }) };
        }
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ data: table === 'custom_products' ? [{ sale_price: 20 }] : [] }),
          }),
        };
      }),
    });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: {
        email: 'member@b.com',
        items: [{ handle: 'floral-set', price_data: { name: 'Floral Set', amount: 20 }, quantity: 1 }],
      },
    }, res);
    const call = mockCreate.mock.calls[0][0];
    expect(call.discounts).toBeUndefined();
  });

  test('fails closed (suppresses discount) and still completes checkout when a sale-check query errors', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/dberr' });
    Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
    getSupabase.mockReturnValue({
      from: jest.fn((table) => ({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue(
            table === 'product_overrides'
              ? { data: null, error: { message: 'db error' } }
              : { data: [] }
          ),
        }),
      })),
    });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { price_id: 'price_xxx', email: 'a@b.com', handle: 'dress-23', promotion_code_id: 'promo_yyy' },
    }, res);
    const call = mockCreate.mock.calls[0][0];
    expect(call.discounts).toBeUndefined();
    expect(res.json).toHaveBeenCalledWith({ url: 'https://checkout.stripe.com/dberr' });
  });

  test('fails closed (suppresses discount) and still completes checkout when the sale-check query throws', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/threw' });
    Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockRejectedValue(new Error('network exception')),
        }),
      }),
    });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { price_id: 'price_xxx', email: 'a@b.com', handle: 'dress-24', promotion_code_id: 'promo_yyy' },
    }, res);
    const call = mockCreate.mock.calls[0][0];
    expect(call.discounts).toBeUndefined();
    expect(res.json).toHaveBeenCalledWith({ url: 'https://checkout.stripe.com/threw' });
  });

  test('still applies promotion_code_id when nothing is on sale', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/nosale' });
    Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
    getSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ in: jest.fn().mockResolvedValue({ data: [] }) }) }),
    });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { price_id: 'price_xxx', email: 'a@b.com', handle: 'dress-22', promotion_code_id: 'promo_yyy' },
    }, res);
    const call = mockCreate.mock.calls[0][0];
    expect(call.discounts).toEqual([{ promotion_code: 'promo_yyy' }]);
  });
});

test('includes shipping address fields in session metadata', async () => {
  const mockCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/addr' });
  Stripe.mockReturnValue({ checkout: { sessions: { create: mockCreate } } });
  const res = makeRes();
  await handler({
    method: 'POST',
    body: {
      price_id: 'price_xxx', email: 'a@b.com',
      shipping_name: 'Jane Doe', shipping_street: '123 Main St', shipping_city: 'Springfield',
      shipping_state: 'IL', shipping_postal_code: '62701', shipping_country: 'US', shipping_phone: '555-1234',
    },
  }, res);
  const call = mockCreate.mock.calls[0][0];
  expect(call.metadata).toEqual({
    coupon_code: '',
    shipping_name: 'Jane Doe', shipping_street: '123 Main St', shipping_city: 'Springfield',
    shipping_state: 'IL', shipping_postal_code: '62701', shipping_country: 'US', shipping_phone: '555-1234',
  });
});

describe('action=record-paypal-order', () => {
  test('returns 400 when required fields are missing', async () => {
    Stripe.mockReturnValue({});
    const res = makeRes();
    await handler({ method: 'POST', body: { action: 'record-paypal-order', email: 'a@b.com' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'email, paypal_order_id, and amount required' });
  });

  test('inserts a paypal order_links row with address fields', async () => {
    Stripe.mockReturnValue({});
    const mockInsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ insert: mockInsert }) });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: {
        action: 'record-paypal-order',
        email: 'buyer@test.com',
        paypal_order_id: 'PAYPAL123',
        amount: '47.50',
        shipping_name: 'Jane Doe', shipping_street: '123 Main St', shipping_city: 'Springfield',
        shipping_state: 'IL', shipping_postal_code: '62701', shipping_country: 'US', shipping_phone: '555-1234',
      },
    }, res);
    expect(mockInsert).toHaveBeenCalledWith({
      paypal_order_id: 'PAYPAL123',
      payment_provider: 'paypal',
      customer_email: 'buyer@test.com',
      shipping_name: 'Jane Doe', shipping_street: '123 Main St', shipping_city: 'Springfield',
      shipping_state: 'IL', shipping_postal_code: '62701', shipping_country: 'US', shipping_phone: '555-1234',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ recorded: true });
  });

  test('still returns success when the Supabase insert fails', async () => {
    Stripe.mockReturnValue({});
    const mockInsert = jest.fn().mockRejectedValue(new Error('insert failed'));
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ insert: mockInsert }) });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { action: 'record-paypal-order', email: 'buyer@test.com', paypal_order_id: 'PAYPAL456', amount: '10.00' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ recorded: true });
  });
});

describe('action=product-update', () => {
  function makeReq(body) { return { method: 'POST', body: { action: 'product-update', password: 'test-admin-pw', ...body } }; }

  beforeEach(() => { process.env.ADMIN_PASSWORD = 'test-admin-pw'; });
  afterEach(() => { delete process.env.ADMIN_PASSWORD; });

  test('saves sale_price when provided', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ upsert }) });
    const res = makeRes();
    await handler(makeReq({ handle: 'dress-21', sale_price: '56.00' }), res);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ handle: 'dress-21', sale_price: 56 }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('clears sale_price when empty string', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ upsert }) });
    const res = makeRes();
    await handler(makeReq({ handle: 'dress-21', sale_price: '' }), res);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ handle: 'dress-21', sale_price: null }));
  });

  test('omits sale_price from update when not provided', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ upsert }) });
    const res = makeRes();
    await handler(makeReq({ handle: 'dress-21', price: '80' }), res);
    expect(upsert).toHaveBeenCalledWith(expect.not.objectContaining({ sale_price: expect.anything() }));
  });
});

describe('action=create-product', () => {
  beforeEach(() => { process.env.ADMIN_PASSWORD = 'test-admin-pw'; });
  afterEach(() => { delete process.env.ADMIN_PASSWORD; });

  test('saves sale_price on a new custom product', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ upsert }) });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { action: 'create-product', password: 'test-admin-pw', handle: 'floral-set', title: 'Floral Set', price: '100', sale_price: '75' },
    }, res);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ handle: 'floral-set', price: 100, sale_price: 75 }));
  });

  test('sale_price defaults to null when omitted', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ upsert }) });
    const res = makeRes();
    await handler({
      method: 'POST',
      body: { action: 'create-product', password: 'test-admin-pw', handle: 'floral-set', title: 'Floral Set', price: '100' },
    }, res);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ sale_price: null }));
  });
});
