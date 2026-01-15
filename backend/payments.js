const express = require('express');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./middleware/auth');
const { sendSubscriptionEmail, sendPaymentReceiptEmail, isEmailConfigured } = require('./email');
const { logger, maskUserId, sanitizePaymentData, logPaymentEvent } = require('./services/logger');

const router = express.Router();

// Initialize Supabase with service role key for admin operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';

// Pricing configuration (TEST PRICES - CHANGE BACK FOR PRODUCTION)
const TIERS = {
  starter: {
    name: 'Starter Plan',
    description: 'Access to all AI models and basic features',
    price: 1.00,
    credits: 1000,
    duration_days: 30
  },
  creator: {
    name: 'Creator Plan',
    description: 'Priority processing and more credits',
    price: 1.50,
    credits: 3000,
    duration_days: 30
  },
  pro: {
    name: 'Pro Plan',
    description: 'Full access with API and premium support',
    price: 2.00,
    credits: 6500,
    duration_days: 30
  },
  supernova: {
    name: 'Supernova Membership',
    description: 'Access to Supernova community channels and resources',
    price: 1.00,
    duration_days: 30
  },
  mentorship: {
    name: 'Mentorship Program',
    description: 'Full access including private mentorship channels and 1-on-1 guidance',
    price: 2.00,
    duration_days: 30
  },
  // Credit packages (one-time purchases)
  credits_500: {
    name: '500 Credits',
    description: 'One-time credit top-up',
    price: 1.00,
    credits: 500,
    is_credit_package: true
  },
  credits_1000: {
    name: '1,000 Credits',
    description: 'One-time credit top-up',
    price: 1.50,
    credits: 1000,
    is_credit_package: true
  },
  credits_2500: {
    name: '2,500 Credits',
    description: 'One-time credit top-up',
    price: 2.00,
    credits: 2500,
    is_credit_package: true
  }
};

// Verify NOWPayments IPN signature using HMAC-SHA512
function verifyIpnSignature(payload, signature) {
  if (!NOWPAYMENTS_IPN_SECRET) {
    logger.warn('NOWPAYMENTS_IPN_SECRET not set, skipping signature verification');
    return true;
  }

  // Sort payload keys alphabetically and create JSON string
  const sortedPayload = Object.keys(payload)
    .sort()
    .reduce((acc, key) => {
      acc[key] = payload[key];
      return acc;
    }, {});

  const payloadString = JSON.stringify(sortedPayload);
  const hmac = crypto.createHmac('sha512', NOWPAYMENTS_IPN_SECRET);
  hmac.update(payloadString);
  const expectedSignature = hmac.digest('hex');

  return signature === expectedSignature;
}

// Map NOWPayments status to our internal status
function mapNowPaymentsStatus(nowPaymentsStatus) {
  const statusMap = {
    'waiting': 'pending',
    'confirming': 'pending',
    'confirmed': 'pending',
    'sending': 'pending',
    'partially_paid': 'partial',
    'finished': 'completed',
    'failed': 'failed',
    'refunded': 'refunded',
    'expired': 'expired'
  };
  return statusMap[nowPaymentsStatus] || 'pending';
}

// Create a NOWPayments invoice
router.post('/create-charge', requireAuth, async (req, res) => {
  try {
    const { tier } = req.body;
    const userId = req.userId;

    if (!NOWPAYMENTS_API_KEY) {
      logger.error('NOWPAYMENTS_API_KEY is not set');
      return res.status(500).json({ error: 'Payment provider not configured' });
    }

    if (!tier || !TIERS[tier]) {
      logger.warn('Invalid tier requested', { tier, requestId: req.id });
      return res.status(400).json({ error: `Invalid tier: ${tier}` });
    }

    const tierConfig = TIERS[tier];

    // Generate unique order ID
    const orderId = `${tier}-${userId.substring(0, 8)}-${Date.now()}`;

    // Build success and cancel URLs
    const successUrl = `${process.env.FRONTEND_URL || 'https://vixxxen.ai'}/billing.html?payment=success&tier=${tier}`;
    const cancelUrl = `${process.env.FRONTEND_URL || 'https://vixxxen.ai'}/billing.html?payment=cancelled`;
    const ipnCallbackUrl = `${process.env.BACKEND_URL || 'https://vixxxen.ai'}/api/payments/webhook/nowpayments`;

    // Create invoice via NOWPayments API
    const invoicePayload = {
      price_amount: tierConfig.price,
      price_currency: 'usd',
      order_id: orderId,
      order_description: tierConfig.name,
      ipn_callback_url: ipnCallbackUrl,
      success_url: successUrl,
      cancel_url: cancelUrl
    };

    logPaymentEvent('Creating invoice', { tier, userId: maskUserId(userId), requestId: req.id });

    const response = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
      method: 'POST',
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(invoicePayload)
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error('NOWPayments invoice creation failed', {
        statusCode: response.status,
        error: data.message,
        requestId: req.id
      });
      return res.status(500).json({
        error: data.message || 'Failed to create invoice',
        details: data
      });
    }

    if (!data.id || !data.invoice_url) {
      logger.error('Invalid NOWPayments response structure', { requestId: req.id });
      return res.status(500).json({
        error: 'Invalid response from payment provider',
        details: 'Missing required fields in response'
      });
    }

    logPaymentEvent('Invoice created', { tier, userId: maskUserId(userId), requestId: req.id });

    // Store pending payment in database
    const { error: dbError } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        provider: 'nowpayments',
        provider_charge_id: data.id.toString(),
        amount: tierConfig.price,
        currency: 'USD',
        status: 'pending',
        tier: tier,
        metadata: {
          order_id: orderId,
          invoice_url: data.invoice_url
        }
      });

    if (dbError) {
      logger.error('Database error storing payment', { error: dbError.message, requestId: req.id });
    }

    res.json({
      success: true,
      invoice_id: data.id,
      invoice_url: data.invoice_url,
      order_id: orderId
    });

  } catch (error) {
    logger.error('Create invoice error', { error: error.message, requestId: req.id });
    res.status(500).json({
      error: 'Failed to create payment',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// NOWPayments IPN webhook handler
router.post('/webhook/nowpayments', async (req, res) => {
  try {
    const data = req.body;
    const signature = req.headers['x-nowpayments-sig'];

    logPaymentEvent('Webhook received', { status: data.payment_status, requestId: req.id });

    // Verify IPN signature
    if (signature) {
      const isValid = verifyIpnSignature(data, signature);
      if (!isValid) {
        logger.warn('Invalid IPN signature on webhook', { requestId: req.id });
      } else {
        logger.debug('IPN signature verified', { requestId: req.id });
      }
    } else {
      logger.warn('No IPN signature provided in webhook', { requestId: req.id });
    }

    const paymentId = data.payment_id;
    const invoiceId = data.invoice_id;
    const paymentStatus = data.payment_status;
    const orderId = data.order_id;

    // Parse tier from order_id (format: tier-userId-timestamp)
    const orderParts = orderId ? orderId.split('-') : [];
    const tier = orderParts[0];

    // Get the payment record using invoice_id (which we store as provider_charge_id)
    const { data: payment } = await supabase
      .from('payments')
      .select('user_id, tier')
      .eq('provider_charge_id', invoiceId?.toString())
      .single();

    const userId = payment?.user_id;
    const paymentTier = payment?.tier || tier;

    logger.info('Processing webhook', {
      status: paymentStatus,
      tier: paymentTier,
      userId: maskUserId(userId),
      requestId: req.id
    });

    // Map NOWPayments status to our internal status
    const internalStatus = mapNowPaymentsStatus(paymentStatus);

    // Handle different payment statuses
    switch (internalStatus) {
      case 'completed':
        // Payment confirmed - activate membership or add credits
        logPaymentEvent('Payment completed', { tier: paymentTier, userId: maskUserId(userId) });

        // Update payment status
        await supabase
          .from('payments')
          .update({
            status: 'completed',
            crypto_currency: data.pay_currency || 'unknown',
            metadata: {
              payment_id: paymentId,
              pay_amount: data.pay_amount,
              actually_paid: data.actually_paid,
              outcome_amount: data.outcome_amount,
              outcome_currency: data.outcome_currency
            },
            updated_at: new Date().toISOString()
          })
          .eq('provider_charge_id', invoiceId?.toString());

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

          logger.info('Credits added', { credits: creditsToAdd, userId: maskUserId(userId) });

          // Send receipt email for credit purchase
          if (isEmailConfigured()) {
            try {
              const { data: userProfile } = await supabase
                .from('profiles')
                .select('email, full_name, display_name')
                .eq('id', userId)
                .single();

              if (userProfile?.email) {
                await sendPaymentReceiptEmail(
                  userProfile.email,
                  userProfile.display_name || userProfile.full_name,
                  tierConfig.price,
                  'USD',
                  paymentTier,
                  invoiceId
                );
              }
            } catch (emailError) {
              logger.error('Failed to send credit purchase receipt', { error: emailError.message });
            }
          }
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

            logger.info('Subscription credits added', { credits: tierConfig.credits, userId: maskUserId(userId) });
          }

          logger.info('Membership activated', { tier: paymentTier, userId: maskUserId(userId) });

          // Send confirmation emails if email service is configured
          if (isEmailConfigured()) {
            try {
              // Get user email and name
              const { data: userProfile } = await supabase
                .from('profiles')
                .select('email, full_name, display_name')
                .eq('id', userId)
                .single();

              if (userProfile?.email) {
                const userName = userProfile.display_name || userProfile.full_name;

                // Send subscription confirmation
                await sendSubscriptionEmail(
                  userProfile.email,
                  userName,
                  paymentTier,
                  expiresAt.toISOString()
                );

                // Send payment receipt
                await sendPaymentReceiptEmail(
                  userProfile.email,
                  userName,
                  tierConfig.price,
                  'USD',
                  paymentTier,
                  invoiceId
                );
              }
            } catch (emailError) {
              logger.error('Failed to send confirmation emails', { error: emailError.message });
              // Don't fail the webhook - emails are non-critical
            }
          }
        }
        break;

      case 'pending':
        // Payment pending confirmation
        await supabase
          .from('payments')
          .update({
            status: 'pending',
            crypto_currency: data.pay_currency || null,
            updated_at: new Date().toISOString()
          })
          .eq('provider_charge_id', invoiceId?.toString());
        logger.info('Payment pending', { userId: maskUserId(userId) });
        break;

      case 'partial':
        // Partial payment received
        await supabase
          .from('payments')
          .update({
            status: 'partial',
            metadata: {
              payment_id: paymentId,
              pay_amount: data.pay_amount,
              actually_paid: data.actually_paid
            },
            updated_at: new Date().toISOString()
          })
          .eq('provider_charge_id', invoiceId?.toString());
        logger.info('Partial payment received', { userId: maskUserId(userId) });
        break;

      case 'failed':
      case 'expired':
      case 'refunded':
        // Payment failed, expired, or refunded
        await supabase
          .from('payments')
          .update({
            status: internalStatus,
            updated_at: new Date().toISOString()
          })
          .eq('provider_charge_id', invoiceId?.toString());
        logger.info('Payment status changed', { status: internalStatus, userId: maskUserId(userId) });
        break;

      default:
        logger.warn('Unhandled NOWPayments status', { status: paymentStatus });
    }

    // NOWPayments expects 200 OK response
    res.status(200).json({ status: 'ok' });

  } catch (error) {
    logger.error('Webhook error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get payment status from NOWPayments
router.get('/status/:paymentId', requireAuth, async (req, res) => {
  try {
    const { paymentId } = req.params;

    if (!NOWPAYMENTS_API_KEY) {
      return res.status(500).json({ error: 'Payment provider not configured' });
    }

    const response = await fetch(`${NOWPAYMENTS_API_URL}/payment/${paymentId}`, {
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || 'Failed to get payment status'
      });
    }

    res.json({
      payment_id: data.payment_id,
      status: mapNowPaymentsStatus(data.payment_status),
      original_status: data.payment_status,
      pay_currency: data.pay_currency,
      pay_amount: data.pay_amount,
      actually_paid: data.actually_paid
    });

  } catch (error) {
    logger.error('Get payment status error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to get payment status' });
  }
});

// Get available cryptocurrencies from NOWPayments
router.get('/currencies', async (req, res) => {
  try {
    if (!NOWPAYMENTS_API_KEY) {
      return res.status(500).json({ error: 'Payment provider not configured' });
    }

    const response = await fetch(`${NOWPAYMENTS_API_URL}/currencies`, {
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || 'Failed to get currencies'
      });
    }

    res.json({ currencies: data.currencies });

  } catch (error) {
    logger.error('Get currencies error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to get currencies' });
  }
});

// Get user's subscription status
router.get('/subscription', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

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
    logger.error('Get subscription error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// Get user's payment history
router.get('/history', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ payments });

  } catch (error) {
    logger.error('Get payment history error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to get payment history' });
  }
});

// ==================== MEMBERSHIP RULES ACKNOWLEDGMENT ====================

// Check if user has acknowledged community rules
router.get('/membership/rules-status', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    const { data: membership, error } = await supabase
      .from('memberships')
      .select('rules_acknowledged_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('Error checking rules status', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to check rules status' });
    }

    // User has acknowledged if they have a timestamp
    const acknowledged = !!(membership?.rules_acknowledged_at);

    res.json({ acknowledged });

  } catch (error) {
    logger.error('Rules status error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to check rules status' });
  }
});

// Acknowledge community rules
router.post('/membership/acknowledge-rules', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    // Update the user's active membership with acknowledgment timestamp
    const { data: membership, error: fetchError } = await supabase
      .from('memberships')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (fetchError) {
      logger.error('Error finding membership', { error: fetchError.message, requestId: req.id });
      return res.status(404).json({ error: 'No active membership found' });
    }

    const { error: updateError } = await supabase
      .from('memberships')
      .update({ rules_acknowledged_at: new Date().toISOString() })
      .eq('id', membership.id);

    if (updateError) {
      logger.error('Error acknowledging rules', { error: updateError.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to save acknowledgment' });
    }

    logger.info('User acknowledged community rules', { userId: maskUserId(userId) });
    res.json({ success: true, acknowledged_at: new Date().toISOString() });

  } catch (error) {
    logger.error('Acknowledge rules error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to acknowledge rules' });
  }
});

module.exports = router;
