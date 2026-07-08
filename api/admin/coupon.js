const Stripe = require('stripe');
const { Resend } = require('resend');
const { getSupabase } = require('../_lib/supabase');

const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';

const escHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

module.exports = async (req, res) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  if (req.method === 'GET' && req.query?.resource === 'orders') {
    const { password, email } = req.query || {};
    if (password !== process.env.ADMIN_PASSWORD)
      return res.status(401).json({ error: 'Unauthorized' });
    if (!email)
      return res.status(400).json({ error: 'email required' });

    const supabase = getSupabase();
    const { data: links } = await supabase
      .from('order_links')
      .select('stripe_session_id')
      .eq('customer_email', email);
    const sessionIds = [...new Set((links || []).map((r) => r.stripe_session_id).filter(Boolean))];
    if (sessionIds.length === 0) return res.status(200).json({ orders: [] });

    const orders = await Promise.all(
      sessionIds.map(async (stripe_session_id) => {
        const session = await stripe.checkout.sessions.retrieve(stripe_session_id, {
          expand: ['payment_intent.latest_charge'],
        });
        const charge = session.payment_intent?.latest_charge;
        const amountRefunded = charge?.amount_refunded || 0;
        const refundStatus = !amountRefunded ? 'none' : charge?.refunded ? 'full' : 'partial';
        return {
          session_id: stripe_session_id,
          date: new Date(session.created * 1000).toISOString(),
          amount: session.amount_total,
          currency: session.currency,
          refund_status: refundStatus,
          amount_refunded: amountRefunded,
        };
      })
    );
    orders.sort((a, b) => new Date(b.date) - new Date(a.date));
    return res.status(200).json({ orders });
  }

  if (req.method === 'POST' && req.query?.resource === 'refund') {
    const { password, session_id, amount } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD)
      return res.status(401).json({ error: 'Unauthorized' });
    if (!session_id)
      return res.status(400).json({ error: 'session_id required' });

    try {
      const supabase = getSupabase();
      const { data: orderLink } = await supabase
        .from('order_links')
        .select('stripe_session_id')
        .eq('stripe_session_id', session_id)
        .maybeSingle();
      if (!orderLink)
        return res.status(400).json({ error: 'no order found for this session_id' });

      const session = await stripe.checkout.sessions.retrieve(session_id);
      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      if (!paymentIntentId)
        return res.status(400).json({ error: 'no payment found for this session' });

      const refundParams = { payment_intent: paymentIntentId };
      if (amount != null) refundParams.amount = Math.round(Number(amount) * 100);

      const refund = await stripe.refunds.create(refundParams);

      const customerEmail = session.customer_details?.email;
      if (customerEmail) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: FROM_EMAIL,
            to: customerEmail,
            subject: 'Refund Confirmation - LYP SPACE',
            html: `
              <div style="font-family:Helvetica Neue,Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;padding:40px 0;">
                <h2 style="font-weight:400;letter-spacing:0.04em;margin-bottom:24px;">Your refund has been processed</h2>
                <p style="margin-bottom:16px;">Hello,</p>
                <p style="margin-bottom:24px;">We've processed a refund for your order. It should appear on your original payment method within 5-10 business days.</p>
                <table style="width:100%;border-collapse:collapse;margin:24px 0;border-top:1px solid #e0e0e0;">
                  <tr>
                    <td style="padding:12px 0;color:#6b6b6b;border-bottom:1px solid #e0e0e0;">Order ID</td>
                    <td style="padding:12px 0;border-bottom:1px solid #e0e0e0;">${escHtml(session_id)}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0;color:#6b6b6b;">Refund Amount</td>
                    <td style="padding:12px 0;">${escHtml((refund.amount / 100).toFixed(2))} ${escHtml((refund.currency || 'usd').toUpperCase())}</td>
                  </tr>
                </table>
                <p style="color:#6b6b6b;font-size:12px;border-top:1px solid #e0e0e0;padding-top:24px;">LYP SPACE</p>
              </div>
            `,
          });
        } catch (err) {
          console.error('Failed to send refund confirmation email:', err.message);
        }
      }

      return res.status(200).json({
        refunded: true,
        refund_id: refund.id,
        amount: refund.amount,
        status: refund.status,
      });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'refund failed' });
    }
  }

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

    try {
      const coupon = await stripe.coupons.create(couponParams);

      const promoParams = { coupon: coupon.id, code: code.toUpperCase() };
      if (max_uses) promoParams.max_redemptions = Number(max_uses);
      if (expires_at) promoParams.expires_at = Math.floor(new Date(expires_at).getTime() / 1000);

      const promoCode = await stripe.promotionCodes.create(promoParams);
      return res.status(201).json({ created: true, id: promoCode.id, code: promoCode.code });
    } catch (err) {
      return res.status(400).json({ error: err.message || '创建失败' });
    }
  }

  if (req.method === 'DELETE') {
    const { password, promotion_code_id } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD)
      return res.status(401).json({ error: 'Unauthorized' });
    if (!promotion_code_id)
      return res.status(400).json({ error: 'promotion_code_id required' });
    await stripe.promotionCodes.update(promotion_code_id, { active: false });
    return res.status(200).json({ deactivated: true });
  }

  return res.status(405).end();
};
