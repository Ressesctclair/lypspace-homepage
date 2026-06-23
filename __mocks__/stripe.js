if (!global.__stripeMock) {
  global.__stripeMock = jest.fn();
}
module.exports = global.__stripeMock;
