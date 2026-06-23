jest.mock('../../_lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('../../_lib/auth', () => ({ setAuthCookie: jest.fn(), requireAuth: jest.fn() }));

let handler, getSupabase, setAuthCookie;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  getSupabase = require('../../_lib/supabase').getSupabase;
  setAuthCookie = require('../../_lib/auth').setAuthCookie;
  handler = require('../../auth/callback');
});

afterEach(() => {
  jest.restoreAllMocks();
});

const makeRes = () => ({ redirect: jest.fn() });

it('redirects to /login?error=google_failed when code is missing', async () => {
  const res = makeRes();
  await handler({ query: {} }, res);
  expect(res.redirect).toHaveBeenCalledWith('/login?error=google_failed');
});

it('redirects to /login?error=google_failed when fetch throws', async () => {
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));
  const res = makeRes();
  await handler({ query: { code: 'abc' } }, res);
  expect(res.redirect).toHaveBeenCalledWith('/login?error=google_failed');
});

it('redirects to /login?error=google_failed when token exchange returns no access_token', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    json: jest.fn().mockResolvedValue({}),
  });
  const res = makeRes();
  await handler({ query: { code: 'abc' } }, res);
  expect(res.redirect).toHaveBeenCalledWith('/login?error=google_failed');
});

it('redirects to /login?error=google_failed when userinfo returns no email', async () => {
  jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce({ json: jest.fn().mockResolvedValue({ access_token: 'tok' }) })
    .mockResolvedValueOnce({ json: jest.fn().mockResolvedValue({ sub: 'g123' }) });
  const res = makeRes();
  await handler({ query: { code: 'abc' } }, res);
  expect(res.redirect).toHaveBeenCalledWith('/login?error=google_failed');
});

it('redirects to /dashboard on successful OAuth with existing google_id user', async () => {
  jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce({ json: jest.fn().mockResolvedValue({ access_token: 'tok' }) })
    .mockResolvedValueOnce({ json: jest.fn().mockResolvedValue({ sub: 'g123', email: 'a@b.com', name: 'Alice' }) });

  const single = jest.fn().mockResolvedValue({ data: { id: 'u1', email: 'a@b.com' } });
  getSupabase.mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single }) }),
    }),
  });

  const res = makeRes();
  await handler({ query: { code: 'abc' } }, res);
  expect(setAuthCookie).toHaveBeenCalledWith(res, expect.objectContaining({ userId: expect.any(String) }));
  expect(res.redirect).toHaveBeenCalledWith('/dashboard');
});
