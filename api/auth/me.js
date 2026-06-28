const bcrypt = require('bcryptjs');
const { requireAuth } = require('../_lib/auth');
const { getSupabase } = require('../_lib/supabase');

module.exports = async (req, res) => {
  const payload = requireAuth(req, res);
  if (!payload) return;

  if (req.method === 'POST') {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'currentPassword and newPassword required' });
    if (newPassword.length < 8)
      return res.status(400).json({ error: 'new password must be at least 8 characters' });

    const supabase = getSupabase();
    const { data: user } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', payload.userId)
      .single();

    if (!user || !user.password_hash)
      return res.status(400).json({ error: 'cannot change password for Google accounts' });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await supabase.from('users').update({ password_hash: newHash }).eq('id', payload.userId);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'GET') return res.status(405).end();

  const supabase = getSupabase();
  const [{ data: user }, { data: adminSetting }] = await Promise.all([
    supabase.from('users').select('id, email, is_member, name, password_hash').eq('id', payload.userId).single(),
    supabase.from('site_settings').select('value').eq('key', 'admin_emails').single(),
  ]);

  if (!user) return res.status(401).json({ error: 'unauthenticated' });

  const adminEmails = ['imlorennn888@gmail.com', 'support@lypspace.digital'];
  if (adminSetting?.value) {
    try { adminEmails.push(...JSON.parse(adminSetting.value)); } catch (_) {}
  }
  const is_admin = adminEmails.includes(user.email);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      is_member: user.is_member,
      is_admin,
      name: user.name,
      hasPassword: !!user.password_hash,
    },
  });
};
