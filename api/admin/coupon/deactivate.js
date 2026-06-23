const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { password, promotion_code_id } = req.body || {};
  if (password !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Unauthorized' });
  if (!promotion_code_id)
    return res.status(400).json({ error: 'promotion_code_id required' });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  await stripe.promotionCodes.update(promotion_code_id, { active: false });
  return res.status(200).json({ deactivated: true });
};
