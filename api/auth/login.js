const bcrypt = require('bcryptjs');
const { getSupabase } = require('../_lib/supabase');
const { setAuthCookie } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'email and password required' });

  const supabase = getSupabase();
  const { data: user } = await supabase
    .from('users')
    .select('id, email, password_hash, is_member, name')
    .eq('email', email)
    .single();

  if (!user || !user.password_hash)
    return res.status(401).json({ error: 'Incorrect email or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect email or password' });

  setAuthCookie(res, { userId: user.id, email: user.email });
  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      is_member: user.is_member,
      name: user.name,
      hasPassword: true,
    },
  });
};
