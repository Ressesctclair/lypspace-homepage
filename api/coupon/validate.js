const Stripe = require('stripe');
const { getSupabase } = require('../_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { code, email } = req.body || {};
  if (!code || !email)
    return res.status(400).json({ error: 'code and email required' });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
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
    .eq('email', email)
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

  return res.status(200).json({
    valid: true,
    discount,
    promotion_code_id: promo.id,
    message,
  });
};
