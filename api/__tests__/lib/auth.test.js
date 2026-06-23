const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const SECRET = 'test-jwt-secret';

beforeAll(() => {
  process.env.JWT_SECRET = SECRET;
});

describe('requireAuth', () => {
  let requireAuth;
  beforeEach(() => {
    requireAuth = require('../../_lib/auth').requireAuth;
  });

  it('returns payload for valid token', () => {
    const token = jwt.sign({ userId: 'u1', email: 'a@b.com' }, SECRET);
    const req = { headers: { cookie: `auth_token=${token}` } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const result = requireAuth(req, res);
    expect(result.userId).toBe('u1');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns null and 401 when cookie is missing', () => {
    const req = { headers: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    expect(requireAuth(req, res)).toBeNull();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns null and 401 for invalid token', () => {
    const req = { headers: { cookie: 'auth_token=bad.token.here' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    expect(requireAuth(req, res)).toBeNull();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('setAuthCookie', () => {
  it('sets httpOnly cookie containing JWT', () => {
    process.env.JWT_SECRET = SECRET;
    const { setAuthCookie } = require('../../_lib/auth');
    const res = { setHeader: jest.fn() };
    setAuthCookie(res, { userId: 'u1', email: 'a@b.com' });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringMatching(/auth_token=.*HttpOnly/)
    );
  });
});
