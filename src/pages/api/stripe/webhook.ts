import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { buffer } from 'micro';
import { getStripeConfig } from '@/lib/settings';
import { logStripeWebhook } from '@/lib/webhook-logger';

const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(supabaseUrl, supabaseServiceKey);
};

// Disable body parsing, need raw body for Stripe signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get Stripe configuration from database
  const stripeConfig = await getStripeConfig();

  const webhookSecret = stripeConfig.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('Stripe webhook secret not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  if (!stripeConfig.secretKey) {
    console.error('Stripe secret key not configured');
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const stripe = new Stripe(stripeConfig.secretKey);

  let event: Stripe.Event;

  try {
    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'] as string;

    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  const supabase = getServiceClient();

  try {
    console.log(`Processing webhook event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const planId = session.metadata?.plan_id;
        const customerId = session.customer as string;

        console.log('checkout.session.completed:', {
          sessionId: session.id,
          userId,
          planId,
          customerId,
          subscriptionId: session.subscription,
          paymentStatus: session.payment_status,
          metadata: session.metadata,
        });

        if (!userId) {
          console.error('No user_id in session metadata');
          await logStripeWebhook('checkout.session.completed', 'error', 'No user_id in session metadata', {
            eventId: event.id,
            sessionId: session.id,
            customerId,
            requestData: { metadata: session.metadata },
          });
          break;
        }

        if (!planId) {
          console.error('No plan_id in session metadata');
          await logStripeWebhook('checkout.session.completed', 'error', 'No plan_id in session metadata', {
            eventId: event.id,
            sessionId: session.id,
            userId,
            customerId,
            requestData: { metadata: session.metadata },
          });
          break;
        }

        // Update user's plan and subscription info
        const { data: updateData, error: updateError } = await supabase
          .from('users')
          .update({
            plan: planId,
            stripe_customer_id: customerId,
            stripe_subscription_id: session.subscription as string,
            stripe_subscription_status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
          .select();

        if (updateError) {
          console.error('Error updating user plan:', updateError);
          await logStripeWebhook('checkout.session.completed', 'error', `Failed to update user plan: ${updateError.message}`, {
            eventId: event.id,
            userId,
            customerId,
            sessionId: session.id,
            error: updateError.message,
          });
        } else {
          console.log(`User ${userId} subscribed to ${planId}. Updated rows:`, updateData);
          await logStripeWebhook('checkout.session.completed', 'success', `User ${userId} subscribed to ${planId} plan`, {
            eventId: event.id,
            userId,
            customerId,
            sessionId: session.id,
            subscriptionId: session.subscription as string,
            responseData: { plan: planId, updated: updateData?.length || 0 },
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        console.log('customer.subscription.updated:', {
          subscriptionId: subscription.id,
          customerId,
          status: subscription.status,
          metadata: subscription.metadata,
        });

        // Get user by customer ID
        const { data: userData, error: findError } = await supabase
          .from('users')
          .select('id, plan')
          .eq('stripe_customer_id', customerId)
          .single();

        if (findError) {
          console.error('Error finding user by customer ID:', findError);
          break;
        }

        if (userData) {
          const planId = subscription.metadata?.plan_id || userData.plan || 'trial';
          const status = subscription.status;

          const { error: updateError } = await supabase
            .from('users')
            .update({
              plan: status === 'active' ? planId : 'trial',
              stripe_subscription_status: status,
              updated_at: new Date().toISOString(),
            })
            .eq('id', userData.id);

          if (updateError) {
            console.error('Error updating subscription status:', updateError);
            await logStripeWebhook('customer.subscription.updated', 'error', `Failed to update subscription: ${updateError.message}`, {
              eventId: event.id,
              customerId,
              userId: userData.id,
              subscriptionId: subscription.id,
              error: updateError.message,
            });
          } else {
            console.log(`Subscription updated for user ${userData.id}: ${status}, plan: ${planId}`);
            await logStripeWebhook('customer.subscription.updated', 'success', `Subscription ${status} for user ${userData.id}`, {
              eventId: event.id,
              customerId,
              userId: userData.id,
              subscriptionId: subscription.id,
              responseData: { status, plan: planId },
            });
          }
        } else {
          console.log('No user found for customer:', customerId);
          await logStripeWebhook('customer.subscription.updated', 'warning', `No user found for customer ${customerId}`, {
            eventId: event.id,
            customerId,
            subscriptionId: subscription.id,
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Get user by customer ID
        const { data: userData } = await supabase
          .from('users')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (userData) {
          await supabase
            .from('users')
            .update({
              plan: 'trial',
              stripe_subscription_id: null,
              stripe_subscription_status: 'canceled',
              updated_at: new Date().toISOString(),
            })
            .eq('id', userData.id);

          console.log(`Subscription canceled for user ${userData.id}`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoiceAny = invoice as any;
        const subscriptionId = typeof invoiceAny.subscription === 'string'
          ? invoiceAny.subscription
          : invoiceAny.subscription?.id || null;

        console.log('invoice.payment_succeeded:', {
          invoiceId: invoice.id,
          customerId,
          subscriptionId,
          amountPaid: invoice.amount_paid,
        });

        // For subscription invoices, ensure user plan is active
        if (subscriptionId) {
          const { data: userData } = await supabase
            .from('users')
            .select('id, plan')
            .eq('stripe_customer_id', customerId)
            .single();

          if (userData) {
            const { error: updateError } = await supabase
              .from('users')
              .update({
                stripe_subscription_status: 'active',
                updated_at: new Date().toISOString(),
              })
              .eq('id', userData.id);

            if (updateError) {
              console.error('Error updating subscription status on payment:', updateError);
            } else {
              console.log(`Payment confirmed for user ${userData.id}, subscription active`);
              await logStripeWebhook('invoice.payment_succeeded', 'success', `Payment confirmed for user ${userData.id}`, {
                eventId: event.id,
                customerId,
                userId: userData.id,
                subscriptionId: subscriptionId || undefined,
                responseData: { amountPaid: invoice.amount_paid },
              });
            }
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`Payment failed for invoice ${invoice.id}`);
        // You might want to send an email notification here
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    await logStripeWebhook(event.type, 'error', `Webhook handler failed: ${(error as Error).message}`, {
      eventId: event.id,
      error: (error as Error).message,
    });
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
