jest.mock('../../_lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('../../_lib/auth', () => ({ requireAuth: jest.fn() }));
jest.mock('stripe');

let handler, getSupabase, requireAuth, Stripe;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  Stripe = require('stripe');
  getSupabase = require('../../_lib/supabase').getSupabase;
  requireAuth = require('../../_lib/auth').requireAuth;
  requireAuth.mockReturnValue({ userId: 'u1', email: 'a@b.com' });

  const stripeInstance = {
    checkout: {
      sessions: {
        retrieve: jest.fn().mockResolvedValue({
          created: 1700000000,
          amount_total: 4999,
          currency: 'usd',
          line_items: { data: [{ description: 'Product A', quantity: 1 }] },
        }),
      },
    },
  };
  Stripe.mockReturnValue(stripeInstance);

  handler = require('../../user/orders');
});

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

it('returns empty array when user has no orders', async () => {
  const emptyEq = jest.fn().mockResolvedValue({ data: [], error: null });
  getSupabase.mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: emptyEq,
      }),
    }),
  });
  const res = makeRes();
  await handler({ method: 'GET' }, res);
  expect(res.json).toHaveBeenCalledWith({ orders: [] });
});

it('returns 401 when not authenticated', async () => {
  requireAuth.mockReturnValue(null);
  const res = makeRes();
  await handler({ method: 'GET' }, res);
  expect(res.json).not.toHaveBeenCalled();
});

it('returns orders with shipping status', async () => {
  const orderLinkRow = { data: [{ stripe_session_id: 'cs_test' }], error: null };
  const mockFrom = jest.fn()
    // byUser query (first call in Promise.all)
    .mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue(orderLinkRow),
      }),
    })
    // byEmail query (second call in Promise.all)
    .mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    })
    // shipments query for the session
    .mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: { carrier: '顺丰', tracking_number: 'SF123' } }),
        }),
      }),
    });
  getSupabase.mockReturnValue({ from: mockFrom });
  const res = makeRes();
  await handler({ method: 'GET' }, res);
  expect(res.json).toHaveBeenCalledWith({
    orders: [expect.objectContaining({ status: 'shipped', tracking: { carrier: '顺丰', number: 'SF123' } })],
  });
});
