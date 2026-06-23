const { requireAuth } = require('../_lib/auth');
const { getSupabase } = require('../_lib/supabase');

module.exports = async (req, res) => {
  const payload = requireAuth(req, res);
  if (!payload) return;

  const supabase = getSupabase();

  if (req.method === 'GET') {
    const { data } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', payload.userId)
      .order('created_at', { ascending: false });
    return res.status(200).json({ addresses: data || [] });
  }

  if (req.method === 'POST') {
    const { id, name, street, city, postal_code, country, is_default } = req.body || {};

    if (id) {
      // Update existing address (e.g. set as default)
      if (is_default) {
        await supabase
          .from('addresses')
          .update({ is_default: false })
          .eq('user_id', payload.userId);
      }
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (street !== undefined) updates.street = street;
      if (city !== undefined) updates.city = city;
      if (postal_code !== undefined) updates.postal_code = postal_code;
      if (country !== undefined) updates.country = country;
      if (is_default !== undefined) updates.is_default = !!is_default;
      const { data, error } = await supabase
        .from('addresses')
        .update(updates)
        .eq('id', id)
        .eq('user_id', payload.userId)
        .select()
        .single();
      if (error || !data) return res.status(404).json({ error: 'address not found' });
      return res.status(200).json({ address: data });
    }

    if (!name || !street || !city || !postal_code || !country)
      return res.status(400).json({ error: 'name, street, city, postal_code, country are required' });

    if (is_default) {
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', payload.userId);
    }
    const { data, error } = await supabase
      .from('addresses')
      .insert({ user_id: payload.userId, name, street, city, postal_code, country, is_default: !!is_default })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'failed to save address' });
    return res.status(201).json({ address: data });
  }

  if (req.method === 'DELETE') {
    const id = req.query?.id || req.body?.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    await supabase.from('addresses').delete().eq('id', id).eq('user_id', payload.userId);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
};
