if (!global.__bcryptMock) {
  global.__bcryptMock = {
    hash: jest.fn().mockResolvedValue('hashed_password'),
    compare: jest.fn().mockResolvedValue(true),
  };
}
module.exports = global.__bcryptMock;
