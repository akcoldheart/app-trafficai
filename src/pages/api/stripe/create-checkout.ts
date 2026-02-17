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

    // Validate that priceId looks like a Stripe price ID (starts with 'price_')
    if (!priceId.startsWith('price_')) {
      console.error('Checkout error: Invalid price ID format', { priceId, planId, billingPeriod });
      return res.status(400).json({
        error: 'Invalid Stripe Price ID format. Price IDs should start with "price_" (e.g., price_1ABC123xyz). Please check Stripe Configuration in admin settings.',
        details: `Invalid price ID "${priceId}" for plan: ${planId} (${billingPeriod}). Admin needs to enter the actual Stripe Price ID from the Stripe Dashboard, not the dollar amount.`
      });
    }

    const supabase = getServiceClient();
    const isTestMode = stripeConfig.secretKey.startsWith('sk_test_');

    // Get user data
    const { data: userData } = await supabase
      .from('users')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single();

    let customerId = userData?.stripe_customer_id;
    let needsNewCustomer = !customerId;

    // Verify the customer exists in current Stripe mode (test vs live)
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch (customerError: unknown) {
        const stripeError = customerError as { code?: string; message?: string };
        // Customer doesn't exist in current mode (test/live mismatch)
        if (stripeError.code === 'resource_missing' || stripeError.message?.includes('No such customer')) {
          needsNewCustomer = true;
        } else {
          throw customerError;
        }
      }
    }

    if (needsNewCustomer) {
      // Create new Stripe customer for current mode
      const customer = await stripe.customers.create({
        email: user.email || userData?.email,
        metadata: {
          user_id: user.id,
          mode: isTestMode ? 'test' : 'live',
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
