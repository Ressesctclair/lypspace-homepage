jest.mock('stripe');
let Stripe, handler;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.ADMIN_PASSWORD = 'admin-secret';
  process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
  Stripe = require('stripe');
  handler = require('../../../admin/coupon/deactivate');
});

afterEach(() => {
  delete process.env.ADMIN_PASSWORD;
  delete process.env.STRIPE_SECRET_KEY;
});

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn(), end: jest.fn() });

test('returns 405 for non-POST', async () => {
  Stripe.mockReturnValue({});
  const res = makeRes();
  await handler({ method: 'GET', body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});

test('returns 401 for wrong password', async () => {
  Stripe.mockReturnValue({});
  const res = makeRes();
  await handler({ method: 'POST', body: { password: 'wrong', promotion_code_id: 'promo_x' } }, res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
});

test('returns 400 when promotion_code_id missing', async () => {
  Stripe.mockReturnValue({});
  const res = makeRes();
  await handler({ method: 'POST', body: { password: 'admin-secret' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: 'promotion_code_id required' });
});

test('deactivates promotion code and returns success', async () => {
  const mockUpdate = jest.fn().mockResolvedValue({ id: 'promo_x', active: false });
  Stripe.mockReturnValue({ promotionCodes: { update: mockUpdate } });
  const res = makeRes();
  await handler({ method: 'POST', body: { password: 'admin-secret', promotion_code_id: 'promo_x' } }, res);
  expect(mockUpdate).toHaveBeenCalledWith('promo_x', { active: false });
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ deactivated: true });
});
