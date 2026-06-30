process.env.ADMIN_PASSWORD = 'test-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.SUPABASE_URL = 'https://dummy.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'dummy-key';

const handler = require('../api/checkout');

// ── Stripe mock ────────────────────────────────────────────────
const stripeMockInstance = {
  checkout: {
    sessions: {
      retrieve: jest.fn(),
      create: jest.fn(),
    },
  },
  promotionCodes: { list: jest.fn() },
  coupons: { create: jest.fn() },
};
global.__stripeMock = jest.fn(() => stripeMockInstance);

// ── Supabase mock ──────────────────────────────────────────────
const mockSupabaseFrom = jest.fn();
jest.mock('../api/_lib/supabase', () => ({
  getSupabase: () => ({ from: mockSupabaseFrom }),
}));

// ── Helpers ────────────────────────────────────────────────────
function makeReq(query = {}) {
  return { method: 'GET', query, body: {} };
}
function makeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.end = jest.fn(() => res);
  return res;
}

describe('GET /api/checkout?action=admin-orders', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 401 when password is wrong', async () => {
    const req = makeReq({ action: 'admin-orders', password: 'wrong' });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns sorted orders list', async () => {
    const orderLinks = [
      { stripe_session_id: 'cs_1', customer_email: 'a@test.com' },
      { stripe_session_id: 'cs_2', customer_email: 'b@test.com' },
    ];
    const shipments = [
      { stripe_session_id: 'cs_2', carrier: 'UPS', tracking_number: '1Z999' },
    ];

    mockSupabaseFrom.mockImplementation((table) => {
      if (table === 'order_links') {
        return { select: () => Promise.resolve({ data: orderLinks, error: null }) };
      }
      if (table === 'shipments') {
        return { select: () => Promise.resolve({ data: shipments, error: null }) };
      }
    });

    stripeMockInstance.checkout.sessions.retrieve
      .mockResolvedValueOnce({
        id: 'cs_1',
        created: 1751000000,
        amount_total: 12600,
        currency: 'usd',
        line_items: { data: [{ description: 'Rip Curl Bikini (M)', quantity: 1 }] },
      })
      .mockResolvedValueOnce({
        id: 'cs_2',
        created: 1750000000,
        amount_total: 25200,
        currency: 'usd',
        line_items: { data: [{ description: 'Rip Curl Bikini (S)', quantity: 2 }] },
      });

    const req = makeReq({ action: 'admin-orders', password: 'test-secret' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const { orders } = res.json.mock.calls[0][0];
    expect(orders).toHaveLength(2);
    // sorted newest first
    expect(orders[0].session_id).toBe('cs_1');
    expect(orders[0].status).toBe('processing');
    expect(orders[0].tracking).toBeNull();
    expect(orders[1].session_id).toBe('cs_2');
    expect(orders[1].status).toBe('shipped');
    expect(orders[1].tracking).toEqual({ carrier: 'UPS', number: '1Z999' });
  });
});
