jest.mock('../../_lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('../../_lib/auth', () => ({ setAuthCookie: jest.fn() }));
jest.mock('bcryptjs');

const bcrypt = require('bcryptjs');
let handler, getSupabase, setAuthCookie;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  bcrypt.hash.mockResolvedValue('hashed_password');
  getSupabase = require('../../_lib/supabase').getSupabase;
  setAuthCookie = require('../../_lib/auth').setAuthCookie;
  handler = require('../../auth/register');
});

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

function mockDb({ existing, created }) {
  const existingSingle = jest.fn().mockResolvedValue({ data: existing || null });
  const createdSingle = jest.fn().mockResolvedValue({
    data: created || null,
    error: created ? null : 'db-error',
  });
  const mockFrom = jest.fn()
    .mockReturnValueOnce({
      select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: existingSingle }) }),
    })
    .mockReturnValueOnce({
      insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: createdSingle }) }),
    });
  getSupabase.mockReturnValue({ from: mockFrom });
}

it('returns 400 if password too short', async () => {
  const req = { method: 'POST', body: { email: 'a@b.com', password: 'short' } };
  const res = makeRes();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('returns 409 if email already registered', async () => {
  mockDb({ existing: { id: 'x' } });
  const req = { method: 'POST', body: { email: 'a@b.com', password: 'password123' } };
  const res = makeRes();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(409);
});

it('registers user and sets cookie', async () => {
  mockDb({ created: { id: 'new-id', email: 'a@b.com', is_member: false, name: null } });
  const req = { method: 'POST', body: { email: 'a@b.com', password: 'password123' } };
  const res = makeRes();
  await handler(req, res);
  expect(setAuthCookie).toHaveBeenCalledWith(res, { userId: 'new-id', email: 'a@b.com' });
  expect(res.json).toHaveBeenCalledWith({
    user: { id: 'new-id', email: 'a@b.com', is_member: false, name: null, hasPassword: true },
  });
});
