module.exports = jest.fn((...args) => {
  if (typeof global.__stripeMock === 'function') {
    return global.__stripeMock(...args);
  }
});
