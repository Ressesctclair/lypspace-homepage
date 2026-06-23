const jwt = require('jsonwebtoken');
const cookie = require('cookie');

function requireAuth(req, res) {
  const cookies = cookie.parse(req.headers.cookie || '');
  const token = cookies.auth_token;
  if (!token) {
    res.status(401).json({ error: 'unauthenticated' });
    return null;
  }
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    res.status(401).json({ error: 'unauthenticated' });
    return null;
  }
}

function setAuthCookie(res, payload) {
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.setHeader(
    'Set-Cookie',
    cookie.serialize('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'strict',
      maxAge: 604800,
      path: '/',
    })
  );
}

module.exports = { requireAuth, setAuthCookie };
