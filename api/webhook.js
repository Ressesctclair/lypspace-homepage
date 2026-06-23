const Stripe = require('stripe');
const { Resend } = require('resend');
const { getSupabase } = require('./_lib/supabase');

const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';

const escHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const getRawBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

module.exports = async (req, res) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const resend = new Resend(process.env.RESEND_API_KEY);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = session.customer_details?.email;
    if (!customerEmail) {
      console.error('checkout.session.completed: no customer email, skipping confirmation');
      return res.status(200).json({ received: true });
    }
    const customerName = session.customer_details?.name || '亲爱的客户';
    const amount = ((session.amount_total || 0) / 100).toFixed(2);
    const currency = (session.currency || 'USD').toUpperCase();
    const orderId = session.id;

    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: customerEmail,
        subject: '订单确认 - LYP SPACE',
        html: `
          <div style="font-family:Helvetica Neue,Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;padding:40px 0;">
            <h2 style="font-weight:400;letter-spacing:0.04em;margin-bottom:24px;">感谢您的购买</h2>
            <p style="margin-bottom:16px;">您好 ${escHtml(customerName)}，</p>
            <p style="margin-bottom:24px;">我们已收到您的订单，正在为您精心准备发货。</p>
            <table style="width:100%;border-collapse:collapse;margin:24px 0;border-top:1px solid #e0e0e0;">
              <tr>
                <td style="padding:12px 0;color:#6b6b6b;border-bottom:1px solid #e0e0e0;">订单编号</td>
                <td style="padding:12px 0;border-bottom:1px solid #e0e0e0;">${escHtml(orderId)}</td>
              </tr>
              <tr>
                <td style="padding:12px 0;color:#6b6b6b;">订单金额</td>
                <td style="padding:12px 0;">${escHtml(currency)} ${escHtml(amount)}</td>
              </tr>
            </table>
            <p style="margin-bottom:40px;">我们会在发货后再次发送物流信息，请留意邮件。</p>
            <p style="color:#6b6b6b;font-size:12px;border-top:1px solid #e0e0e0;padding-top:24px;">LYP SPACE</p>
          </div>
        `,
      });
    } catch (err) {
      console.error('Failed to send order confirmation:', err.message);
    }

    const supabase = getSupabase();
    const userId = session.metadata?.userId || null;
    try {
      await supabase.from('order_links').upsert(
        { stripe_session_id: session.id, user_id: userId, customer_email: customerEmail },
        { onConflict: 'stripe_session_id' }
      );
    } catch (err) {
      console.error('Failed to write order_links:', err.message);
    }
  }

  return res.status(200).json({ received: true });
};
