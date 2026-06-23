const { requireAuth } = require('../_lib/auth');
const { getSupabase } = require('../_lib/supabase');

module.exports = async (req, res) => {
  const payload = requireAuth(req, res);
  if (!payload) return;

  const supabase = getSupabase();
  const { data: user } = await supabase
    .from('users')
    .select('id, email, is_member, name, password_hash')
    .eq('id', payload.userId)
    .single();

  if (!user) return res.status(401).json({ error: 'unauthenticated' });

  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      is_member: user.is_member,
      name: user.name,
      hasPassword: !!user.password_hash,
    },
  });
};
