jest.mock('../../_lib/supabase', () => ({ getSupabase: jest.fn() }));

let handler, getSupabase;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.ADMIN_PASSWORD = 'admin-secret';
  getSupabase = require('../../_lib/supabase').getSupabase;
  handler = require('../../admin/set-member');
});

afterEach(() => { delete process.env.ADMIN_PASSWORD; });

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

it('returns 401 for wrong password', async () => {
  const res = makeRes();
  await handler({ method: 'POST', body: { password: 'wrong', email: 'a@b.com', is_member: true } }, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

it('returns 400 if is_member is not boolean', async () => {
  const res = makeRes();
  await handler({ method: 'POST', body: { password: 'admin-secret', email: 'a@b.com', is_member: 'yes' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('updates member status', async () => {
  const single = jest.fn().mockResolvedValue({ data: { id: 'u1' }, error: null });
  const eqFn = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single }) });
  const update = jest.fn().mockReturnValue({ eq: eqFn });
  getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ update }) });
  const res = makeRes();
  await handler({ method: 'POST', body: { password: 'admin-secret', email: 'a@b.com', is_member: true } }, res);
  expect(res.json).toHaveBeenCalledWith({ updated: true });
});
