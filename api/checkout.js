const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { price_id, email, promotion_code_id, coupon_code } = req.body || {};
  if (!price_id) return res.status(400).json({ error: 'price_id required' });
  if (!email) return res.status(400).json({ error: 'email required' });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  const params = {
    mode: 'payment',
    line_items: [{ price: price_id, quantity: 1 }],
    customer_email: email,
    success_url: `${process.env.SITE_URL}/dashboard?checkout=success`,
    cancel_url: `${process.env.SITE_URL}/checkout`,
    metadata: { coupon_code: coupon_code || '' },
  };

  if (promotion_code_id) {
    params.discounts = [{ promotion_code: promotion_code_id }];
  }

  const session = await stripe.checkout.sessions.create(params);
  return res.status(200).json({ url: session.url });
};
