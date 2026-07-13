process.env.ADMIN_PASSWORD = 'test-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.SUPABASE_URL = 'https://dummy.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'dummy-key';
process.env.RESEND_API_KEY = 're_test_dummy';

const handler = require('../api/checkout');
const { Resend } = require('resend');

const mockSend = jest.fn();
Resend.mockImplementation(() => ({ emails: { send: mockSend } }));

const stripeMockInstance = {
  checkout: { sessions: { create: jest.fn(), retrieve: jest.fn() } },
  coupons: { retrieve: jest.fn(), create: jest.fn() },
};
global.__stripeMock = jest.fn(() => stripeMockInstance);

const mockSupabaseFrom = jest.fn();
jest.mock('../api/_lib/supabase', () => ({
  getSupabase: () => ({ from: mockSupabaseFrom }),
}));

function makeReq(body = {}) {
  return { method: 'POST', query: {}, body: { action: 'subscribe', ...body } };
}
function makeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.end = jest.fn(() => res);
  return res;
}

describe('POST /api/checkout action=subscribe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: 'email_1' } });
  });

  test('returns 400 for missing email', async () => {
    const req = makeReq({});
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 for invalid email format', async () => {
    const req = makeReq({ email: 'not-an-email' });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('new subscriber: inserts row and sends welcome email', async () => {
    const insertFn = jest.fn().mockResolvedValue({ data: null, error: null });
    mockSupabaseFrom.mockImplementation((table) => {
      if (table === 'newsletter_subscribers') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
          insert: insertFn,
        };
      }
    });

    const req = makeReq({ email: 'new@test.com' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ subscribed: true });
    expect(insertFn).toHaveBeenCalledWith({ email: 'new@test.com' });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe('new@test.com');
  });

  test('duplicate subscriber: no insert, no email, still returns success', async () => {
    const insertFn = jest.fn();
    mockSupabaseFrom.mockImplementation((table) => {
      if (table === 'newsletter_subscribers') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { email: 'exists@test.com' }, error: null }) }),
          }),
          insert: insertFn,
        };
      }
    });

    const req = makeReq({ email: 'exists@test.com' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ subscribed: true });
    expect(insertFn).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('Resend failure still returns success (email already stored)', async () => {
    mockSupabaseFrom.mockImplementation((table) => {
      if (table === 'newsletter_subscribers') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
    });
    mockSend.mockRejectedValue(new Error('Resend down'));

    const req = makeReq({ email: 'new2@test.com' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ subscribed: true });
  });

  test('normalizes email casing/whitespace before dedup check, insert, and welcome email', async () => {
    const eqFn = jest.fn(() => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }));
    const insertFn = jest.fn().mockResolvedValue({ data: null, error: null });
    mockSupabaseFrom.mockImplementation((table) => {
      if (table === 'newsletter_subscribers') {
        return {
          select: () => ({ eq: eqFn }),
          insert: insertFn,
        };
      }
    });

    const req = makeReq({ email: '  New@Test.com  ' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ subscribed: true });
    expect(eqFn).toHaveBeenCalledWith('email', 'new@test.com');
    expect(insertFn).toHaveBeenCalledWith({ email: 'new@test.com' });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe('new@test.com');
  });

  test('logs error when select fails but still proceeds without throwing', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const selectError = { message: 'relation "newsletter_subscribers" does not exist' };
    mockSupabaseFrom.mockImplementation((table) => {
      if (table === 'newsletter_subscribers') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: selectError }) }),
          }),
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
    });

    const req = makeReq({ email: 'select-fail@test.com' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ subscribed: true });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('subscribe'),
      expect.objectContaining({ error: selectError.message })
    );

    consoleErrorSpy.mockRestore();
  });

  test('logs error when insert fails but still proceeds without throwing', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const insertError = { message: 'relation "newsletter_subscribers" does not exist' };
    mockSupabaseFrom.mockImplementation((table) => {
      if (table === 'newsletter_subscribers') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
          insert: jest.fn().mockResolvedValue({ data: null, error: insertError }),
        };
      }
    });

    const req = makeReq({ email: 'insert-fail@test.com' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ subscribed: true });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('subscribe'),
      expect.objectContaining({ error: insertError.message })
    );

    consoleErrorSpy.mockRestore();
  });
});
