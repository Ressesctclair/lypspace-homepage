let handler;
beforeEach(() => {
  jest.resetModules();
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.SITE_URL = 'https://example.com';
  handler = require('../../auth/google');
});

it('redirects to Google OAuth URL with correct params', () => {
  const res = { redirect: jest.fn() };
  handler({}, res);
  expect(res.redirect).toHaveBeenCalledWith(
    expect.stringContaining('accounts.google.com/o/oauth2/v2/auth')
  );
  expect(res.redirect).toHaveBeenCalledWith(
    expect.stringContaining('client_id=test-client-id')
  );
});
