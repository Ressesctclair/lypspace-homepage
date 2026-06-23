jest.mock('../../_lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('../../_lib/auth', () => ({ requireAuth: jest.fn() }));

let handler, getSupabase, requireAuth;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  getSupabase = require('../../_lib/supabase').getSupabase;
  requireAuth = require('../../_lib/auth').requireAuth;
  requireAuth.mockReturnValue({ userId: 'u1', email: 'a@b.com' });
  handler = require('../../user/addresses');
});

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

it('GET returns address list', async () => {
  const fakeAddresses = [{ id: 'addr1', name: 'Home' }];
  getSupabase.mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: fakeAddresses }),
        }),
      }),
    }),
  });
  const res = makeRes();
  await handler({ method: 'GET' }, res);
  expect(res.json).toHaveBeenCalledWith({ addresses: fakeAddresses });
});

it('POST returns 400 when required fields missing', async () => {
  requireAuth.mockReturnValue({ userId: 'u1', email: 'a@b.com' });
  getSupabase.mockReturnValue({ from: jest.fn() });
  const res = makeRes();
  await handler({ method: 'POST', body: { name: 'Home' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('DELETE removes address', async () => {
  const eqFn = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({}) });
  const delFn = jest.fn().mockReturnValue({ eq: eqFn });
  getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ delete: delFn }) });
  const res = makeRes();
  await handler({ method: 'DELETE', query: { id: 'addr1' }, body: {} }, res);
  expect(res.json).toHaveBeenCalledWith({ ok: true });
});
