jest.mock('../../_lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('../../_lib/auth', () => ({ requireAuth: jest.fn() }));
jest.mock('bcryptjs');

let handler, getSupabase, requireAuth, bcrypt;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  bcrypt = require('bcryptjs');
  bcrypt.compare.mockResolvedValue(true);
  bcrypt.hash.mockResolvedValue('new_hash');
  getSupabase = require('../../_lib/supabase').getSupabase;
  requireAuth = require('../../_lib/auth').requireAuth;
  requireAuth.mockReturnValue({ userId: 'u1', email: 'a@b.com' });
  handler = require('../../auth/change-password');
});

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

function mockUser(passwordHash) {
  const single = jest.fn().mockResolvedValue({ data: { password_hash: passwordHash } });
  const update = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({}) });
  getSupabase.mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single }) }),
      update,
    }),
  });
}

it('returns 405 for non-POST methods', async () => {
  const res = { status: jest.fn().mockReturnThis(), end: jest.fn() };
  await handler({ method: 'GET' }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});

it('returns 400 if fields are missing', async () => {
  mockUser('hash');
  const res = makeRes();
  await handler({ method: 'POST', body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('returns 400 if newPassword is too short', async () => {
  mockUser('hash');
  const res = makeRes();
  await handler({ method: 'POST', body: { currentPassword: 'a', newPassword: 'short' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('returns 400 for Google-only accounts', async () => {
  mockUser(null);
  const res = makeRes();
  await handler({ method: 'POST', body: { currentPassword: 'a', newPassword: 'newpassword' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('returns 401 for wrong current password', async () => {
  mockUser('hash');
  bcrypt.compare.mockResolvedValueOnce(false);
  const res = makeRes();
  await handler({ method: 'POST', body: { currentPassword: 'wrong', newPassword: 'newpassword' } }, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

it('updates password hash on success', async () => {
  mockUser('old_hash');
  const res = makeRes();
  await handler({ method: 'POST', body: { currentPassword: 'correct', newPassword: 'newpassword' } }, res);
  expect(res.json).toHaveBeenCalledWith({ ok: true });
});
