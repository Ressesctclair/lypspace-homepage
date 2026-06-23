const Stripe = require('stripe');

module.exports = async (req, res) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  if (req.method === 'GET') {
    const { password } = req.query || {};
    if (password !== process.env.ADMIN_PASSWORD)
      return res.status(401).json({ error: 'Unauthorized' });

    const { data } = await stripe.promotionCodes.list({ limit: 50, expand: ['data.coupon'] });
    const coupons = data.map(p => ({
      id: p.id,
      code: p.code,
      active: p.active,
      discount: p.coupon.percent_off != null
        ? { type: 'percent', value: p.coupon.percent_off }
        : { type: 'amount', value: p.coupon.amount_off / 100, currency: p.coupon.currency },
      max_uses: p.max_redemptions,
      used: p.times_redeemed,
      expires_at: p.expires_at,
    }));
    return res.status(200).json({ coupons });
  }

  if (req.method === 'POST') {
    const { password, code, type, value, max_uses, expires_at } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD)
      return res.status(401).json({ error: 'Unauthorized' });
    if (!code || !type || value == null)
      return res.status(400).json({ error: 'code, type, value required' });
    if (!['percent', 'amount'].includes(type))
      return res.status(400).json({ error: 'type must be percent or amount' });

    const couponParams = type === 'percent'
      ? { percent_off: Number(value), duration: 'once' }
      : { amount_off: Math.round(Number(value) * 100), currency: 'usd', duration: 'once' };

    const coupon = await stripe.coupons.create(couponParams);

    const promoParams = { coupon: coupon.id, code: code.toUpperCase() };
    if (max_uses) promoParams.max_redemptions = Number(max_uses);
    if (expires_at) promoParams.expires_at = Math.floor(new Date(expires_at).getTime() / 1000);

    const promoCode = await stripe.promotionCodes.create(promoParams);
    return res.status(201).json({ created: true, id: promoCode.id, code: promoCode.code });
  }

  return res.status(405).end();
};
