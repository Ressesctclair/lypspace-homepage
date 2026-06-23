const { getSupabase } = require('../_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { password, email, is_member } = req.body || {};
  if (password !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Unauthorized' });
  if (!email)
    return res.status(400).json({ error: 'email required' });
  if (typeof is_member !== 'boolean')
    return res.status(400).json({ error: 'is_member must be boolean' });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('users')
    .update({ is_member })
    .eq('email', email)
    .select('id')
    .single();

  if (error || !data)
    return res.status(404).json({ error: 'user not found' });

  return res.status(200).json({ updated: true });
};
