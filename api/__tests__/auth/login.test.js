jest.mock('../../_lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('../../_lib/auth', () => ({ setAuthCookie: jest.fn() }));
jest.mock('bcryptjs');

const bcrypt = require('bcryptjs');
let handler, getSupabase;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  bcrypt.compare.mockResolvedValue(true);
  getSupabase = require('../../_lib/supabase').getSupabase;
  handler = require('../../auth/login');
});

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

function mockUser(user) {
  const single = jest.fn().mockResolvedValue({ data: user });
  getSupabase.mockReturnValue({
    from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single }) }) }),
  });
}

it('returns 401 if user not found', async () => {
  mockUser(null);
  const res = makeRes();
  await handler({ method: 'POST', body: { email: 'a@b.com', password: 'pw' } }, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

it('returns 401 if password is wrong', async () => {
  mockUser({ id: 'u1', email: 'a@b.com', password_hash: 'hash', is_member: false, name: null });
  bcrypt.compare.mockResolvedValueOnce(false);
  const res = makeRes();
  await handler({ method: 'POST', body: { email: 'a@b.com', password: 'wrong' } }, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

it('returns user on success', async () => {
  mockUser({ id: 'u1', email: 'a@b.com', password_hash: 'hash', is_member: false, name: null });
  const res = makeRes();
  await handler({ method: 'POST', body: { email: 'a@b.com', password: 'correct' } }, res);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ user: expect.objectContaining({ email: 'a@b.com' }) })
  );
});
