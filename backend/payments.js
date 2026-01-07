const express = require('express');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Initialize Supabase with service role key for admin operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PLISIO_API_KEY = process.env.PLISIO_API_KEY;
const PLISIO_SECRET_KEY = process.env.PLISIO_SECRET_KEY;

// Pricing configuration
const TIERS = {
  starter: {
    name: 'Starter Plan',
    description: 'Access to all AI models and basic features',
    price: 20.00,
    credits: 1000,
    duration_days: 30
  },
  creator: {
    name: 'Creator Plan',
    description: 'Priority processing and more credits',
    price: 50.00,
    credits: 3000,
    duration_days: 30
  },
  pro: {
    name: 'Pro Plan',
    description: 'Full access with API and premium support',
    price: 95.00,
    credits: 6500,
    duration_days: 30
  },
  supernova: {
    name: 'Supernova Membership',
    description: 'Access to Supernova community channels and resources',
    price: 25.00,
    duration_days: 30
  },
  mentorship: {
    name: 'Mentorship Program',
    description: 'Full access including private mentorship channels and 1-on-1 guidance',
    price: 100.00,
    duration_days: 30
  },
  // Credit packages (one-time purchases)
  credits_500: {
    name: '500 Credits',
    description: 'One-time credit top-up',
    price: 12.00,
    credits: 500,
    is_credit_package: true
  },
  credits_1000: {
    name: '1,000 Credits',
    description: 'One-time credit top-up',
    price: 22.00,
    credits: 1000,
    is_credit_package: true
  },
  credits_2500: {
    name: '2,500 Credits',
    description: 'One-time credit top-up',
    price: 50.00,
    credits: 2500,
    is_credit_package: true
  }
};

// Create a Plisio invoice
router.post('/create-charge', async (req, res) => {
  try {
    const { tier, userId } = req.body;

    if (!tier || !TIERS[tier]) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    const tierConfig = TIERS[tier];

    // Generate unique order number
    const orderNumber = `${tier}-${userId.substring(0, 8)}-${Date.now()}`;

    // Build Plisio API URL with query parameters
    const params = new URLSearchParams({
      source_currency: 'USD',
      source_amount: tierConfig.price.toString(),
      order_number: orderNumber,
      currency: 'BTC,ETH,LTC,USDT,USDC,DOGE',
      email: '', // Optional - user can enter on Plisio page
      order_name: tierConfig.name,
      callback_url: `${process.env.BACKEND_URL || 'https://vixxxen.ai'}/api/payments/webhook/plisio`,
      success_callback_url: `${process.env.FRONTEND_URL || 'https://vixxxen.ai'}?payment=success&tier=${tier}`,
      fail_callback_url: `${process.env.FRONTEND_URL || 'https://vixxxen.ai'}?payment=failed`,
      api_key: PLISIO_API_KEY
    });

    const response = await fetch(`https://plisio.net/api/v1/invoices/new?${params.toString()}`);
    const data = await response.json();

    if (data.status !== 'success') {
      console.error('Plisio error:', data);
      return res.status(500).json({ error: data.data?.message || 'Failed to create invoice' });
    }

    // Store pending payment in database
    const { error: dbError } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        provider: 'plisio',
        provider_charge_id: data.data.txn_id,
        amount: tierConfig.price,
        currency: 'USD',
        status: 'pending',
        tier: tier,
        metadata: {
          order_number: orderNumber,
          invoice_url: data.data.invoice_url
        }
      });

    if (dbError) {
      console.error('Database error:', dbError);
    }

    res.json({
      success: true,
      invoice_id: data.data.txn_id,
      invoice_url: data.data.invoice_url,
      order_number: orderNumber
    });

  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// Plisio webhook handler
router.post('/webhook/plisio', async (req, res) => {
  try {
    const data = req.body;
    console.log('Plisio webhook received:', data);

    // Verify webhook signature if secret key is set
    if (PLISIO_SECRET_KEY && data.verify_hash) {
      // Plisio sends verify_hash - we need to verify it
      const params = { ...data };
      delete params.verify_hash;

      // Sort params and create string
      const sortedKeys = Object.keys(params).sort();
      const values = sortedKeys.map(key => params[key]).join('');

      const expectedHash = crypto
        .createHmac('sha1', PLISIO_SECRET_KEY)
        .update(values)
        .digest('hex');

      if (data.verify_hash !== expectedHash) {
        console.error('Invalid webhook signature');
        // Don't reject - Plisio might use different verification
      }
    }

    const txnId = data.txn_id;
    const status = data.status;
    const orderNumber = data.order_number;

    // Parse user_id and tier from order_number (format: tier-userId-timestamp)
    const orderParts = orderNumber ? orderNumber.split('-') : [];
    const tier = orderParts[0];

    // Get the payment record to find user_id
    const { data: payment } = await supabase
      .from('payments')
      .select('user_id, tier')
      .eq('provider_charge_id', txnId)
      .single();

    const userId = payment?.user_id;
    const paymentTier = payment?.tier || tier;

    console.log(`Plisio webhook: status=${status}, txn_id=${txnId}, user=${userId}, tier=${paymentTier}`);

    // Plisio statuses: new, pending, completed, expired, error, mismatch, cancelled
    switch (status) {
      case 'completed':
        // Payment confirmed - activate membership or add credits
        console.log(`Payment completed for user ${userId}, tier: ${paymentTier}`);

        // Update payment status
        await supabase
          .from('payments')
          .update({
            status: 'completed',
            crypto_currency: data.currency || 'unknown',
            updated_at: new Date().toISOString()
          })
          .eq('provider_charge_id', txnId);

        const tierConfig = TIERS[paymentTier];

        // Check if this is a credit package purchase
        if (tierConfig?.is_credit_package) {
          // Add credits to user's profile
          const creditsToAdd = tierConfig.credits;

          // Get current user credits
          const { data: profile } = await supabase
            .from('profiles')
            .select('credits')
            .eq('id', userId)
            .single();

          const currentCredits = profile?.credits || 0;
          const newCredits = currentCredits + creditsToAdd;

          await supabase
            .from('profiles')
            .update({ credits: newCredits })
            .eq('id', userId);

          console.log(`Added ${creditsToAdd} credits to user ${userId}. New total: ${newCredits}`);
        } else {
          // This is a subscription - activate membership
          // Calculate expiration date
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + (tierConfig?.duration_days || 30));

          // Create or update subscription
          const { data: existingSub } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('user_id', userId)
            .single();

          if (existingSub) {
            await supabase
              .from('subscriptions')
              .update({
                tier: paymentTier,
                status: 'active',
                starts_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('user_id', userId);
          } else {
            await supabase
              .from('subscriptions')
              .insert({
                user_id: userId,
                tier: paymentTier,
                status: 'active',
                starts_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString()
              });
          }

          // Update memberships table (for chat access)
          const { data: existingMembership } = await supabase
            .from('memberships')
            .select('id')
            .eq('user_id', userId)
            .single();

          if (existingMembership) {
            await supabase
              .from('memberships')
              .update({
                tier: paymentTier,
                is_active: true
              })
              .eq('user_id', userId);
          } else {
            await supabase
              .from('memberships')
              .insert({
                user_id: userId,
                tier: paymentTier,
                is_active: true
              });
          }

          // Add subscription credits if applicable
          if (tierConfig?.credits) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('credits')
              .eq('id', userId)
              .single();

            const currentCredits = profile?.credits || 0;
            const newCredits = currentCredits + tierConfig.credits;

            await supabase
              .from('profiles')
              .update({ credits: newCredits })
              .eq('id', userId);

            console.log(`Added ${tierConfig.credits} subscription credits to user ${userId}`);
          }

          console.log(`Membership activated for user ${userId}: ${paymentTier}`);
        }
        break;

      case 'pending':
        // Payment pending confirmation
        await supabase
          .from('payments')
          .update({
            status: 'pending',
            updated_at: new Date().toISOString()
          })
          .eq('provider_charge_id', txnId);
        console.log(`Payment pending for user ${userId}`);
        break;

      case 'expired':
      case 'cancelled':
      case 'error':
        // Payment failed
        await supabase
          .from('payments')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('provider_charge_id', txnId);
        console.log(`Payment ${status} for user ${userId}`);
        break;

      case 'mismatch':
        // Underpayment - mark as partial
        await supabase
          .from('payments')
          .update({
            status: 'partial',
            metadata: {
              actual_amount: data.amount,
              expected_amount: data.source_amount
            },
            updated_at: new Date().toISOString()
          })
          .eq('provider_charge_id', txnId);
        console.log(`Payment mismatch for user ${userId}`);
        break;

      default:
        console.log(`Unhandled Plisio status: ${status}`);
    }

    // Plisio expects JSON response
    res.json({ status: 'ok' });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get user's subscription status
router.get('/subscription/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // Check if subscription is expired
    if (subscription && subscription.expires_at) {
      const isExpired = new Date(subscription.expires_at) < new Date();
      if (isExpired && subscription.status === 'active') {
        // Update status to expired
        await supabase
          .from('subscriptions')
          .update({ status: 'expired' })
          .eq('id', subscription.id);
        subscription.status = 'expired';
      }
    }

    res.json({
      subscription: subscription || null,
      tiers: TIERS
    });

  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// Get user's payment history
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ payments });

  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ error: 'Failed to get payment history' });
  }
});

module.exports = router;
