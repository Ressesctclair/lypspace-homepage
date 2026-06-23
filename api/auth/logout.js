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
  return res.status(200).json({ ok: true });
};
