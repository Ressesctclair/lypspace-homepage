const Stripe = require('stripe');
const { requireAuth } = require('../_lib/auth');
const { getSupabase } = require('../_lib/supabase');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  const payload = requireAuth(req, res);
  if (!payload) return;

  const supabase = getSupabase();

  if (req.query?.resource === 'addresses') {
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
        if (is_default) {
          await supabase.from('addresses').update({ is_default: false }).eq('user_id', payload.userId);
        }
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (street !== undefined) updates.street = street;
        if (city !== undefined) updates.city = city;
        if (postal_code !== undefined) updates.postal_code = postal_code;
        if (country !== undefined) updates.country = country;
        if (is_default !== undefined) updates.is_default = !!is_default;
        if (Object.keys(updates).length === 0)
          return res.status(400).json({ error: 'no fields to update' });
        const { data } = await supabase.from('addresses').update(updates).eq('id', id).eq('user_id', payload.userId).select().maybeSingle();
        if (!data) return res.status(404).json({ error: 'address not found' });
        return res.status(200).json({ address: data });
      }
      if (!name || !street || !city || !postal_code || !country)
        return res.status(400).json({ error: 'name, street, city, postal_code, country are required' });
      if (is_default) {
        await supabase.from('addresses').update({ is_default: false }).eq('user_id', payload.userId);
      }
      const { data, error } = await supabase.from('addresses').insert({ user_id: payload.userId, name, street, city, postal_code, country, is_default: !!is_default }).select().single();
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
  }

  if (req.method !== 'GET') return res.status(405).end();

  const [byUser, byEmail] = await Promise.all([
    supabase.from('order_links').select('stripe_session_id').eq('user_id', payload.userId),
    supabase.from('order_links').select('stripe_session_id').eq('customer_email', payload.email),
  ]);
  const sessionIds = [
    ...new Set([
      ...(byUser.data || []).map(r => r.stripe_session_id),
      ...(byEmail.data || []).map(r => r.stripe_session_id),
    ])
  ];
  if (sessionIds.length === 0) return res.status(200).json({ orders: [] });

  const orders = await Promise.all(
    sessionIds.map(async (stripe_session_id) => {
      const [session, shipment] = await Promise.all([
        stripe.checkout.sessions.retrieve(stripe_session_id, {
          expand: ['line_items'],
        }),
        supabase
          .from('shipments')
          .select('carrier, tracking_number')
          .eq('stripe_session_id', stripe_session_id)
          .maybeSingle(),
      ]);
      return {
        session_id: stripe_session_id,
        date: new Date(session.created * 1000).toISOString(),
        amount: session.amount_total,
        currency: session.currency,
        items: (session.line_items?.data || []).map((i) => ({
          name: i.description,
          quantity: i.quantity,
        })),
        status: shipment.data ? 'shipped' : 'processing',
        tracking: shipment.data
          ? { carrier: shipment.data.carrier, number: shipment.data.tracking_number }
          : null,
      };
    })
  );

  orders.sort((a, b) => new Date(b.date) - new Date(a.date));
  return res.status(200).json({ orders });
};
