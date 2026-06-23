if (!global.__resendMock) {
  global.__resendMock = { Resend: jest.fn() };
}
module.exports = global.__resendMock;
