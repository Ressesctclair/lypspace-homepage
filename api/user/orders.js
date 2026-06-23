const Stripe = require('stripe');
const { requireAuth } = require('../_lib/auth');
const { getSupabase } = require('../_lib/supabase');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  const payload = requireAuth(req, res);
  if (!payload) return;

  if (req.method !== 'GET') return res.status(405).end();

  const supabase = getSupabase();

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
