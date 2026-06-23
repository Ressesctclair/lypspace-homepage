jest.mock('../../_lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('../../_lib/auth', () => ({ requireAuth: jest.fn() }));

let handler, getSupabase, requireAuth;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  getSupabase = require('../../_lib/supabase').getSupabase;
  requireAuth = require('../../_lib/auth').requireAuth;
  handler = require('../../auth/me');
});

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

it('returns 401 if not authenticated', async () => {
  requireAuth.mockReturnValue(null);
  const res = makeRes();
  await handler({ method: 'GET' }, res);
  expect(res.json).not.toHaveBeenCalled();
});

it('returns user with hasPassword flag', async () => {
  requireAuth.mockReturnValue({ userId: 'u1', email: 'a@b.com' });
  const single = jest.fn().mockResolvedValue({
    data: { id: 'u1', email: 'a@b.com', is_member: false, name: null, password_hash: 'hash' },
  });
  getSupabase.mockReturnValue({
    from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single }) }) }),
  });
  const res = makeRes();
  await handler({ method: 'GET' }, res);
  expect(res.json).toHaveBeenCalledWith({
    user: expect.objectContaining({ hasPassword: true, is_member: false }),
  });
});
