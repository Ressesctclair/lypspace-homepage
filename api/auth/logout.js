const cookie = require('cookie');

module.exports = (req, res) => {
  res.setHeader(
    'Set-Cookie',
    cookie.serialize('auth_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    })
  );
  // Redirect directly so the browser applies the Set-Cookie before loading the next page
  res.setHeader('Location', '/');
  return res.status(302).end();
};
