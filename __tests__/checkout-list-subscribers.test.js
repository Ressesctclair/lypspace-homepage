process.env.ADMIN_PASSWORD = 'test-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.SUPABASE_URL = 'https://dummy.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'dummy-key';

const handler = require('../api/checkout');

const mockSupabaseFrom = jest.fn();
jest.mock('../api/_lib/supabase', () => ({
  getSupabase: () => ({ from: mockSupabaseFrom }),
}));

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

describe('GET /api/checkout?action=list-subscribers', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 401 when password is wrong', async () => {
    const req = makeReq({ action: 'list-subscribers', password: 'wrong' });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns subscribers newest first', async () => {
    const rows = [
      { email: 'a@test.com', created_at: '2026-07-10T00:00:00Z' },
      { email: 'b@test.com', created_at: '2026-07-01T00:00:00Z' },
    ];
    mockSupabaseFrom.mockImplementation((table) => {
      if (table === 'newsletter_subscribers') {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: rows, error: null }),
          }),
        };
      }
    });

    const req = makeReq({ action: 'list-subscribers', password: 'test-secret' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const { subscribers } = res.json.mock.calls[0][0];
    expect(subscribers).toEqual(rows);
  });
});
