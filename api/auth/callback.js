const { getSupabase } = require('../_lib/supabase');
const { setAuthCookie } = require('../_lib/auth');

module.exports = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/login?error=google_failed');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.SITE_URL}/api/auth/callback`,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return res.redirect('/login?error=google_failed');

    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const googleUser = await infoRes.json();
    if (!googleUser.email) return res.redirect('/login?error=google_failed');

    const supabase = getSupabase();

    let { data: user } = await supabase
      .from('users')
      .select('id, email')
      .eq('google_id', googleUser.sub)
      .single();

    if (!user) {
      const { data: byEmail } = await supabase
        .from('users')
        .select('id, email')
        .eq('email', googleUser.email)
        .single();

      if (byEmail) {
        await supabase
          .from('users')
          .update({ google_id: googleUser.sub, name: googleUser.name })
          .eq('id', byEmail.id);
        user = byEmail;
      } else {
        const { data: newUser } = await supabase
          .from('users')
          .insert({ email: googleUser.email, google_id: googleUser.sub, name: googleUser.name })
          .select('id, email')
          .single();
        user = newUser;
      }
    }

    if (!user) return res.redirect('/login?error=google_failed');

    setAuthCookie(res, { userId: user.id, email: user.email });
    return res.redirect('/dashboard');
  } catch {
    return res.redirect('/login?error=google_failed');
  }
};
