const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const { action, code, email: validateEmail } = req.body || {};

  if (action === 'validate') {
    if (!code || !validateEmail)
      return res.status(400).json({ error: 'code and email required' });

    const { getSupabase } = require('./_lib/supabase');
    const upperCode = code.toUpperCase();

    const { data: promoCodes } = await stripe.promotionCodes.list({
      code: upperCode,
      limit: 1,
      active: true,
    });
    const promo = promoCodes[0];

    if (!promo)
      return res.status(200).json({ valid: false, error: '折扣码无效' });

    if (promo.expires_at && promo.expires_at < Math.floor(Date.now() / 1000))
      return res.status(200).json({ valid: false, error: '折扣码已过期' });

    if (promo.max_redemptions != null && promo.times_redeemed >= promo.max_redemptions)
      return res.status(200).json({ valid: false, error: '折扣码已用完' });

    const supabase = getSupabase();
    const { data: existing } = await supabase
      .from('coupon_uses')
      .select('id')
      .eq('coupon_code', upperCode)
      .eq('email', validateEmail)
      .maybeSingle();

    if (existing)
      return res.status(200).json({ valid: false, error: '每人限用一次' });

    const coupon = promo.coupon;
    const isPercent = coupon.percent_off != null;
    const discount = isPercent
      ? { type: 'percent', value: coupon.percent_off }
      : { type: 'amount', value: coupon.amount_off / 100, currency: coupon.currency };
    const message = isPercent
      ? `立省 ${coupon.percent_off}%`
      : `立省 ${coupon.currency.toUpperCase()} ${(coupon.amount_off / 100).toFixed(2)}`;

    return res.status(200).json({ valid: true, discount, promotion_code_id: promo.id, message });
  }

  const { price_id, email, promotion_code_id, coupon_code } = req.body || {};
  const normalizedCouponCode = coupon_code ? coupon_code.toUpperCase() : '';
  if (!price_id) return res.status(400).json({ error: 'price_id required' });
  if (!email) return res.status(400).json({ error: 'email required' });

  const params = {
    mode: 'payment',
    line_items: [{ price: price_id, quantity: 1 }],
    customer_email: email,
    success_url: `${process.env.SITE_URL}/dashboard?checkout=success`,
    cancel_url: `${process.env.SITE_URL}/checkout`,
    metadata: { coupon_code: normalizedCouponCode },
  };

  if (promotion_code_id) {
    params.discounts = [{ promotion_code: promotion_code_id }];
  }

  const session = await stripe.checkout.sessions.create(params);
  return res.status(200).json({ url: session.url });
};
