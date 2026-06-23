const { Readable } = require('stream');

jest.mock('resend');
jest.mock('../_lib/supabase', () => ({ getSupabase: jest.fn() }));

let Resend;

let handler;
let mockEmailSend;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  ({ Resend } = require('resend'));
  process.env.ADMIN_PASSWORD = 'test-admin-pass-123';
  mockEmailSend = jest.fn().mockResolvedValue({ id: 'email-456' });
  Resend.mockImplementation(() => ({ emails: { send: mockEmailSend } }));
  const { getSupabase } = require('../_lib/supabase');
  getSupabase.mockReturnValue({
    from: jest.fn().mockReturnValue({ insert: jest.fn().mockResolvedValue({}) }),
  });
  handler = require('../ship');
});

afterEach(() => {
  jest.clearAllMocks();
  delete process.env.ADMIN_PASSWORD;
});

const makeReq = (body, method = 'POST') => {
  const req = new Readable({ read() {} });
  req.method = method;
  req.headers = { 'content-type': 'application/json' };
  req.push(JSON.stringify(body));
  req.push(null);
  return req;
};

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const validBody = {
  password: 'test-admin-pass-123',
  customerEmail: 'buyer@test.com',
  carrier: '顺丰',
  trackingNumber: 'SF1234567890',
  orderRef: 'ORDER-001',
};

test('rejects non-POST with 405', async () => {
  const req = makeReq(validBody, 'GET');
  const res = makeRes();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(405);
});

test('rejects wrong password with 401', async () => {
  const req = makeReq({ ...validBody, password: 'wrong' });
  const res = makeRes();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(mockEmailSend).not.toHaveBeenCalled();
});

test('rejects missing required fields with 400', async () => {
  const req = makeReq({ password: 'test-admin-pass-123', customerEmail: 'buyer@test.com' });
  const res = makeRes();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockEmailSend).not.toHaveBeenCalled();
});

test('sends shipping notification with correct data', async () => {
  const req = makeReq(validBody);
  const res = makeRes();
  await handler(req, res);
  expect(mockEmailSend).toHaveBeenCalledWith(
    expect.objectContaining({
      to: 'buyer@test.com',
      subject: '您的订单已发货 - LYP SPACE',
      html: expect.stringContaining('SF1234567890'),
    })
  );
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ sent: true });
});

test('includes carrier tracking link in email', async () => {
  const req = makeReq(validBody);
  const res = makeRes();
  await handler(req, res);
  const html = mockEmailSend.mock.calls[0][0].html;
  expect(html).toContain('SF1234567890');
  expect(html).toContain('sf-express.com');
});

test('writes shipment record to supabase', async () => {
  const { getSupabase } = require('../_lib/supabase');
  const mockInsert = jest.fn().mockResolvedValue({});
  getSupabase.mockReturnValue({ from: jest.fn().mockReturnValue({ insert: mockInsert }) });
  await handler(makeReq(validBody), makeRes());
  expect(mockInsert).toHaveBeenCalledWith(
    expect.objectContaining({ carrier: '顺丰', tracking_number: 'SF1234567890' })
  );
});
