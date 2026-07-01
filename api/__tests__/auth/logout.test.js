let handler;
beforeEach(() => { jest.resetModules(); handler = require('../../auth/logout'); });

it('clears auth cookie', () => {
  const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn(), end: jest.fn() };
  handler({}, res);
  expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('Max-Age=0'));
});
