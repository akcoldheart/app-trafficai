import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getStripeConfig } from '@/lib/settings';

const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(supabaseUrl, supabaseServiceKey);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stripeConfig = await getStripeConfig();

    if (!stripeConfig.secretKey) {
      return res.status(500).json({ error: 'Stripe is not configured' });
    }

    const stripe = new Stripe(stripeConfig.secretKey);

    const user = await getAuthenticatedUser(req, res);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    // Verify this session belongs to the current user
    if (session.metadata?.user_id !== user.id) {
      return res.status(403).json({ error: 'Session does not belong to this user' });
    }

    // Check if payment was successful
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed', status: session.payment_status });
    }

    const planId = session.metadata?.plan_id;
    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID not found in session' });
    }

    const supabase = getServiceClient();

    // Update the user's plan in the database
    const { error: updateError } = await supabase
      .from('users')
      .update({
        plan: planId,
        stripe_subscription_id: subscriptionId,
        stripe_subscription_status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating user plan:', updateError);
      return res.status(500).json({ error: 'Failed to update plan' });
    }

    console.log(`Plan updated for user ${user.id}: ${planId} (via session verification)`);

    return res.status(200).json({
      success: true,
      plan: planId,
      subscriptionId,
    });
  } catch (error) {
    console.error('Session verification error:', error);
    return res.status(500).json({
      error: 'Failed to verify session',
      details: (error as Error).message,
    });
  }
}
