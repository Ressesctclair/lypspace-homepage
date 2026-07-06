const Stripe = require('stripe');

module.exports = async (req, res) => {
  req.query = req.query || {};
  const { getSupabase } = require('./_lib/supabase');

  // ── Product overrides (GET, public) ────────────────────────────
  if (req.method === 'GET' && req.query.action === 'inventory') {
    const supabase = getSupabase();
    const { data } = await supabase.from('product_overrides').select('*');
    const map = {};
    (data || []).forEach(r => { map[r.handle] = r; });
    return res.status(200).json({ inventory: map });
  }

  // ── Admin orders list (GET, admin) ───────────────────────────
  if (req.method === 'GET' && req.query.action === 'admin-orders') {
    if (req.query.password !== process.env.ADMIN_PASSWORD)
      return res.status(401).json({ error: 'Unauthorized' });

    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const supabase = getSupabase();

    const [{ data: orderLinks }, { data: shipmentRows }] = await Promise.all([
      supabase.from('order_links').select('stripe_session_id, customer_email'),
      supabase.from('shipments').select('stripe_session_id, carrier, tracking_number'),
    ]);

    const shipmentMap = {};
    (shipmentRows || []).forEach(s => { shipmentMap[s.stripe_session_id] = s; });

    const orders = await Promise.all(
      (orderLinks || []).map(async ({ stripe_session_id, customer_email }) => {
        const shipment = shipmentMap[stripe_session_id] || null;
        try {
          const session = await stripe.checkout.sessions.retrieve(stripe_session_id, {
            expand: ['line_items'],
          });
          return {
            session_id: stripe_session_id,
            date: new Date(session.created * 1000).toISOString(),
            customer_email,
            amount: session.amount_total,
            currency: session.currency,
            items: (session.line_items?.data || []).map(i => ({
              name: i.description,
              quantity: i.quantity,
            })),
            status: shipment ? 'shipped' : 'processing',
            tracking: shipment
              ? { carrier: shipment.carrier, number: shipment.tracking_number }
              : null,
          };
        } catch {
          return null;
        }
      })
    );

    const validOrders = orders.filter(Boolean);
    validOrders.sort((a, b) => new Date(b.date) - new Date(a.date));
    return res.status(200).json({ orders: validOrders });
  }

  // ── Full data export (GET, admin) ────────────────────────────
  if (req.method === 'GET' && req.query.action === 'export') {
    if (req.query.password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    const supabase = getSupabase();
    const [{ data: products }, { data: overrides }, { data: settings }] = await Promise.all([
      supabase.from('custom_products').select('*').order('created_at', { ascending: false }),
      supabase.from('product_overrides').select('*'),
      supabase.from('site_settings').select('*'),
    ]);
    return res.status(200).json({
      exported_at: new Date().toISOString(),
      site: 'lypspace.digital',
      custom_products: products || [],
      product_overrides: overrides || [],
      site_settings: settings || [],
    });
  }

  // ── Cloudinary signed upload (GET, admin) ──────────────────────
  if (req.method === 'GET' && req.query.action === 'sign-upload') {
    const crypto = require('crypto');
    const timestamp = Math.round(Date.now() / 1000);
    const folder = 'lyp-space';
    const str = `folder=${folder}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`;
    const signature = crypto.createHash('sha1').update(str).digest('hex');
    return res.status(200).json({
      timestamp, signature,
      api_key: process.env.CLOUDINARY_API_KEY,
      cloud_name: 'dhsgdejtf',
      folder
    });
  }

  // ── Site settings (GET, public) ───────────────────────────────
  if (req.method === 'GET' && req.query.action === 'settings') {
    const supabase = getSupabase();
    const { data } = await supabase.from('site_settings').select('key,value');
    const settings = {};
    (data || []).forEach(r => { settings[r.key] = r.value; });
    return res.status(200).json({ settings });
  }

  // ── Custom products (GET) ──────────────────────────────────────
  if (req.method === 'GET' && req.query.action === 'products') {
    const isAdmin = req.query.pw === process.env.ADMIN_PASSWORD;
    const supabase = getSupabase();
    const { data } = await supabase.from('custom_products').select('*').order('created_at', { ascending: false });
    let products = data || [];
    if (!isAdmin) {
      // Read hidden handles from site_settings
      const { data: settRows } = await supabase.from('site_settings').select('value').eq('key', 'hidden_products').single();
      const hiddenHandles = settRows ? JSON.parse(settRows.value || '[]') : [];
      products = products.filter(p => !hiddenHandles.includes(p.handle));
    }
    return res.status(200).json({ products });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const { action, code, email: validateEmail } = req.body || {};

  // ── Product update (admin) ───────────────────────────────────────
  if (action === 'product-update') {
    const { password, handle, in_stock, price, sale_price, description, variant_qtys } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    if (!handle) return res.status(400).json({ error: 'handle required' });
    const supabase = getSupabase();
    const update = { handle, updated_at: new Date().toISOString() };
    if (typeof in_stock === 'boolean') update.in_stock = in_stock;
    if (price !== undefined) update.price = price === '' ? null : parseFloat(price);
    if (sale_price !== undefined) update.sale_price = sale_price === '' ? null : parseFloat(sale_price);
    if (description !== undefined) update.description = description;
    if (variant_qtys !== undefined) update.variant_qtys = variant_qtys;
    await supabase.from('product_overrides').upsert(update);
    return res.status(200).json({ ok: true });
  }

  // ── Create / update custom product (admin) ─────────────────────
  if (action === 'create-product') {
    const { password, handle, title, type, price, sale_price, description, images, variants } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    if (!handle || !title) return res.status(400).json({ error: 'handle and title required' });
    const supabase = getSupabase();
    const total_qty = (variants || []).reduce((s, v) => s + (parseInt(v.qty) || 0), 0);
    await supabase.from('custom_products').upsert({
      handle, title, type: type || '', price: parseFloat(price) || 0,
      sale_price: sale_price ? parseFloat(sale_price) : null,
      description: description || '', images: images || [], variants: variants || [],
      total_qty, created_at: new Date().toISOString()
    });
    return res.status(200).json({ ok: true });
  }

  // ── Save site setting (admin) ──────────────────────────────────
  if (action === 'save-setting') {
    const { password, key, value } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    if (!key) return res.status(400).json({ error: 'key required' });
    const supabase = getSupabase();
    await supabase.from('site_settings').upsert({ key, value, updated_at: new Date().toISOString() });
    return res.status(200).json({ ok: true });
  }

  // ── Toggle product visibility (admin) ─────────────────────────
  if (action === 'toggle-hidden') {
    const { password, handle, hidden } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    const supabase = getSupabase();
    const { data: row } = await supabase.from('site_settings').select('value').eq('key', 'hidden_products').single();
    let hiddenHandles = row ? JSON.parse(row.value || '[]') : [];
    if (hidden) {
      if (!hiddenHandles.includes(handle)) hiddenHandles.push(handle);
    } else {
      hiddenHandles = hiddenHandles.filter(h => h !== handle);
    }
    await supabase.from('site_settings').upsert({ key: 'hidden_products', value: JSON.stringify(hiddenHandles), updated_at: new Date().toISOString() });
    return res.status(200).json({ ok: true });
  }

  // ── Delete custom product (admin) ──────────────────────────────
  if (action === 'delete-product') {
    const { password, handle } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    const supabase = getSupabase();
    await supabase.from('custom_products').delete().eq('handle', handle);
    return res.status(200).json({ ok: true });
  }

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
      return res.status(200).json({ valid: false, error: 'Invalid discount code' });

    if (promo.expires_at && promo.expires_at < Math.floor(Date.now() / 1000))
      return res.status(200).json({ valid: false, error: 'This code has expired' });

    if (promo.max_redemptions != null && promo.times_redeemed >= promo.max_redemptions)
      return res.status(200).json({ valid: false, error: 'This code has reached its usage limit' });

    const supabase = getSupabase();
    const { data: existing } = await supabase
      .from('coupon_uses')
      .select('id')
      .eq('coupon_code', upperCode)
      .eq('email', validateEmail)
      .maybeSingle();

    if (existing)
      return res.status(200).json({ valid: false, error: 'This code can only be used once per customer' });

    const coupon = promo.coupon;
    const isPercent = coupon.percent_off != null;
    const discount = isPercent
      ? { type: 'percent', value: coupon.percent_off }
      : { type: 'amount', value: coupon.amount_off / 100, currency: coupon.currency };
    const message = isPercent
      ? `${coupon.percent_off}% off applied`
      : `${coupon.currency.toUpperCase()} ${(coupon.amount_off / 100).toFixed(2)} off applied`;

    return res.status(200).json({ valid: true, discount, promotion_code_id: promo.id, message });
  }

  if (action === 'check-member') {
    const { email: checkEmail } = req.body || {};
    if (!checkEmail) return res.status(400).json({ error: 'email required' });
    const supabase = getSupabase();
    const { data: user } = await supabase
      .from('users')
      .select('is_member')
      .eq('email', checkEmail)
      .maybeSingle();
    return res.status(200).json({ is_member: !!(user && user.is_member) });
  }

  if (action === 'record-paypal-order') {
    const {
      email: paypalEmail, paypal_order_id, amount: paypalAmount,
      shipping_name, shipping_street, shipping_city, shipping_state, shipping_postal_code, shipping_country, shipping_phone,
    } = req.body || {};
    if (!paypalEmail || !paypal_order_id || paypalAmount == null)
      return res.status(400).json({ error: 'email, paypal_order_id, and amount required' });

    const supabase = getSupabase();
    try {
      await supabase.from('order_links').insert({
        paypal_order_id,
        payment_provider: 'paypal',
        customer_email: paypalEmail,
        shipping_name: shipping_name || null,
        shipping_street: shipping_street || null,
        shipping_city: shipping_city || null,
        shipping_state: shipping_state || null,
        shipping_postal_code: shipping_postal_code || null,
        shipping_country: shipping_country || null,
        shipping_phone: shipping_phone || null,
      });
    } catch (err) {
      console.error('[checkout] record-paypal-order insert failed — MANUAL RECOVERY NEEDED', {
        paypal_order_id, customer_email: paypalEmail, error: err.message,
      });
    }
    return res.status(200).json({ recorded: true });
  }

  const {
    price_id, email, items, promotion_code_id, coupon_code, quantity, amount, product_name,
    shipping_name, shipping_street, shipping_city, shipping_state, shipping_postal_code, shipping_country, shipping_phone,
  } = req.body || {};
  const normalizedCouponCode = coupon_code ? coupon_code.toUpperCase() : '';
  if (!email) return res.status(400).json({ error: 'email required' });

  function dynamicLineItem(name, amt, qty) {
    return {
      price_data: {
        currency: 'usd',
        product_data: { name },
        unit_amount: Math.round(parseFloat(amt) * 100),
      },
      quantity: Math.max(1, parseInt(qty) || 1),
    };
  }

  let line_items;
  if (items && Array.isArray(items) && items.length) {
    line_items = items.map(i => {
      if (i.price_id) return { price: i.price_id, quantity: Math.max(1, parseInt(i.quantity) || 1) };
      if (i.price_data) return dynamicLineItem(i.price_data.name, i.price_data.amount, i.quantity);
      return null;
    }).filter(Boolean);
  } else if (price_id) {
    line_items = [{ price: price_id, quantity: Math.max(1, parseInt(quantity) || 1) }];
  } else if (amount && product_name) {
    line_items = [dynamicLineItem(product_name, amount, quantity)];
  } else {
    return res.status(400).json({ error: 'price_id, items, or amount+product_name required' });
  }

  const params = {
    mode: 'payment',
    line_items,
    customer_email: email,
    success_url: `${process.env.SITE_URL}/dashboard?checkout=success`,
    cancel_url: `${process.env.SITE_URL}/checkout`,
    metadata: {
      coupon_code: normalizedCouponCode,
      shipping_name: shipping_name || '',
      shipping_street: shipping_street || '',
      shipping_city: shipping_city || '',
      shipping_state: shipping_state || '',
      shipping_postal_code: shipping_postal_code || '',
      shipping_country: shipping_country || '',
      shipping_phone: shipping_phone || '',
    },
  };

  if (promotion_code_id) {
    params.discounts = [{ promotion_code: promotion_code_id }];
  } else {
    const supabase = getSupabase();
    const { data: user } = await supabase.from('users').select('is_member').eq('email', email).maybeSingle();
    if (user && user.is_member) {
      const MEMBER_COUPON_ID = 'member-5pct-off';
      let memberCouponId;
      try {
        await stripe.coupons.retrieve(MEMBER_COUPON_ID);
        memberCouponId = MEMBER_COUPON_ID;
      } catch {
        const created = await stripe.coupons.create({ id: MEMBER_COUPON_ID, percent_off: 5, duration: 'once' });
        memberCouponId = created.id;
      }
      params.discounts = [{ coupon: memberCouponId }];
    }
  }

  const session = await stripe.checkout.sessions.create(params);
  return res.status(200).json({ url: session.url });
};
