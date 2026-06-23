const { Resend } = require('resend');
const { getSupabase } = require('./_lib/supabase');

const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';

const escHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const CARRIER_LINKS = {
  UPS: 'https://www.ups.com/track?tracknum=',
  FedEx: 'https://www.fedex.com/fedextrack/?tracknumbers=',
  DHL: 'https://www.dhl.com/en/express/tracking.html?AWB=',
  USPS: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=',
  'Royal Mail': 'https://www.royalmail.com/track-your-item#/tracking-results/',
  'Canada Post': 'https://www.canadapost-postescanada.ca/track-reperer/alternate#!/details/',
  'Australia Post': 'https://auspost.com.au/mypost/track/#/details/',
  Other: 'https://parcelsapp.com/en/tracking/',
};

const getBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });

module.exports = async (req, res) => {
  const resend = new Resend(process.env.RESEND_API_KEY);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;
  try {
    body = await getBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { password, customerEmail, trackingNumber, carrier, orderRef } = body;

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!customerEmail || !trackingNumber || !carrier) {
    return res.status(400).json({
      error: 'Missing required fields: customerEmail, trackingNumber, carrier',
    });
  }

  const trackingBase = CARRIER_LINKS[carrier] || CARRIER_LINKS['Other'];
  const trackingUrl = `${trackingBase}${trackingNumber}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: customerEmail,
      subject: 'Your order has shipped — LYP SPACE',
      html: `
        <div style="font-family:Helvetica Neue,Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;padding:40px 0;">
          <h2 style="font-weight:400;letter-spacing:0.04em;margin-bottom:24px;">Your order is on its way</h2>
          <p style="margin-bottom:24px;">Great news! Your package has been shipped. You can track it using the information below.</p>
          <table style="width:100%;border-collapse:collapse;margin:24px 0;border-top:1px solid #e0e0e0;">
            ${orderRef ? `<tr><td style="padding:12px 0;color:#6b6b6b;border-bottom:1px solid #e0e0e0;">Order reference</td><td style="padding:12px 0;border-bottom:1px solid #e0e0e0;">${escHtml(orderRef)}</td></tr>` : ''}
            <tr><td style="padding:12px 0;color:#6b6b6b;border-bottom:1px solid #e0e0e0;">Carrier</td><td style="padding:12px 0;border-bottom:1px solid #e0e0e0;">${escHtml(carrier)}</td></tr>
            <tr><td style="padding:12px 0;color:#6b6b6b;">Tracking number</td><td style="padding:12px 0;">${escHtml(trackingNumber)}</td></tr>
          </table>
          <a href="${escHtml(trackingUrl)}" style="display:inline-block;padding:12px 28px;background:#111;color:#fff;text-decoration:none;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">Track your order</a>
          <p style="margin-top:40px;color:#6b6b6b;font-size:12px;border-top:1px solid #e0e0e0;padding-top:24px;">LYP SPACE</p>
        </div>
      `,
    });

    const supabase = getSupabase();
    try {
      await supabase.from('shipments').insert({
        stripe_session_id: body.stripeSessionId || null,
        carrier,
        tracking_number: trackingNumber,
      });
    } catch (err) {
      console.error('Failed to write shipments:', err.message);
    }

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('Failed to send shipping notification:', err.message);
    return res.status(500).json({ error: 'Failed to send email' });
  }
};
