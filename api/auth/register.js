const bcrypt = require('bcryptjs');
const { getSupabase } = require('../_lib/supabase');
const { setAuthCookie } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'email and password required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'invalid email' });
  if (password.length < 8)
    return res.status(400).json({ error: 'password must be at least 8 characters' });

  const supabase = getSupabase();
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();
  if (existing) return res.status(409).json({ error: 'email already registered' });

  const password_hash = await bcrypt.hash(password, 12);
  const { data: user, error } = await supabase
    .from('users')
    .insert({ email, password_hash })
    .select()
    .single();
  if (error || !user) return res.status(500).json({ error: 'registration failed' });

  setAuthCookie(res, { userId: user.id, email: user.email });
  return res.status(200).json({
    user: { id: user.id, email: user.email, is_member: false, name: null, hasPassword: true },
  });
};
