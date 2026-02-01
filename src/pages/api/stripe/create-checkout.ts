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
    // Get Stripe configuration from database
    const stripeConfig = await getStripeConfig();

    if (!stripeConfig.secretKey) {
      return res.status(500).json({ error: 'Stripe is not configured. Please contact administrator.' });
    }

    const stripe = new Stripe(stripeConfig.secretKey);

    const user = await getAuthenticatedUser(req, res);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { priceId, planId, billingPeriod } = req.body;

    if (!priceId) {
      console.error('Checkout error: Missing price ID', { planId, billingPeriod });
      return res.status(400).json({
        error: 'Stripe Price ID is not configured for this plan. Please contact administrator to configure Stripe settings.',
        details: `Missing price ID for plan: ${planId} (${billingPeriod})`
      });
    }

    const supabase = getServiceClient();

    // Get or create Stripe customer
    const { data: userData } = await supabase
      .from('users')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single();

    let customerId = userData?.stripe_customer_id;

    if (!customerId) {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email || userData?.email,
        metadata: {
          user_id: user.id,
        },
      });

      customerId = customer.id;

      // Save customer ID to database
      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    const appUrl = stripeConfig.appUrl || process.env.NEXT_PUBLIC_APP_URL;

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/account/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/account/billing?canceled=true`,
      metadata: {
        user_id: user.id,
        plan_id: planId,
        billing_period: billingPeriod,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_id: planId,
        },
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    const errorMessage = (error as Error).message;
    console.error('Stripe checkout error:', {
      error: errorMessage,
      stack: (error as Error).stack,
      priceId: req.body.priceId,
      planId: req.body.planId,
    });

    // Provide more helpful error messages for common Stripe errors
    let userMessage = 'Failed to create checkout session';
    if (errorMessage.includes('No such price')) {
      userMessage = 'Invalid Stripe Price ID. Please verify the price ID is correct in Stripe dashboard.';
    } else if (errorMessage.includes('api_key')) {
      userMessage = 'Stripe API key is invalid or missing. Please check Stripe configuration.';
    }

    return res.status(500).json({
      error: userMessage,
      details: errorMessage,
    });
  }
}
