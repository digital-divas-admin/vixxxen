const express = require('express');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./middleware/auth');
const { sendSubscriptionEmail, sendPaymentReceiptEmail, isEmailConfigured } = require('./email');

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
    console.warn('NOWPAYMENTS_IPN_SECRET not set, skipping signature verification');
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
      console.error('NOWPAYMENTS_API_KEY is not set');
      return res.status(500).json({ error: 'Payment provider not configured' });
    }

    if (!tier || !TIERS[tier]) {
      console.error('Invalid tier requested:', tier);
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

    console.log('Creating NOWPayments invoice:', invoicePayload);

    const response = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
      method: 'POST',
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(invoicePayload)
    });

    const data = await response.json();

    console.log('NOWPayments API response:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error('NOWPayments error response:', JSON.stringify(data, null, 2));
      return res.status(500).json({
        error: data.message || 'Failed to create invoice',
        details: data
      });
    }

    if (!data.id || !data.invoice_url) {
      console.error('Invalid NOWPayments response structure:', JSON.stringify(data, null, 2));
      return res.status(500).json({
        error: 'Invalid response from payment provider',
        details: 'Missing required fields in response'
      });
    }

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
      console.error('Database error:', dbError);
    }

    res.json({
      success: true,
      invoice_id: data.id,
      invoice_url: data.invoice_url,
      order_id: orderId
    });

  } catch (error) {
    console.error('Create invoice error:', error);
    console.error('Error stack:', error.stack);
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

    console.log('NOWPayments webhook received:', JSON.stringify(data, null, 2));

    // Verify IPN signature
    if (signature) {
      const isValid = verifyIpnSignature(data, signature);
      if (!isValid) {
        console.error('Invalid IPN signature');
        console.error('Received signature:', signature);
        // Log but continue processing for debugging purposes
      } else {
        console.log('IPN signature verified successfully');
      }
    } else {
      console.warn('No IPN signature provided in webhook');
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

    console.log(`NOWPayments webhook: status=${paymentStatus}, invoice_id=${invoiceId}, payment_id=${paymentId}, user=${userId}, tier=${paymentTier}`);

    // Map NOWPayments status to our internal status
    const internalStatus = mapNowPaymentsStatus(paymentStatus);

    // Handle different payment statuses
    switch (internalStatus) {
      case 'completed':
        // Payment confirmed - activate membership or add credits
        console.log(`Payment completed for user ${userId}, tier: ${paymentTier}`);

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

          console.log(`Added ${creditsToAdd} credits to user ${userId}. New total: ${newCredits}`);

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
              console.error('Failed to send credit purchase receipt:', emailError);
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

            console.log(`Added ${tierConfig.credits} subscription credits to user ${userId}`);
          }

          console.log(`Membership activated for user ${userId}: ${paymentTier}`);

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
              console.error('Failed to send confirmation emails:', emailError);
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
        console.log(`Payment pending for user ${userId}`);
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
        console.log(`Partial payment received for user ${userId}`);
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
        console.log(`Payment ${internalStatus} for user ${userId}`);
        break;

      default:
        console.log(`Unhandled NOWPayments status: ${paymentStatus}`);
    }

    // NOWPayments expects 200 OK response
    res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('Webhook error:', error);
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
    console.error('Get payment status error:', error);
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
    console.error('Get currencies error:', error);
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
    console.error('Get subscription error:', error);
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
    console.error('Get payment history error:', error);
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
      console.error('Error checking rules status:', error);
      return res.status(500).json({ error: 'Failed to check rules status' });
    }

    // User has acknowledged if they have a timestamp
    const acknowledged = !!(membership?.rules_acknowledged_at);

    res.json({ acknowledged });

  } catch (error) {
    console.error('Rules status error:', error);
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
      console.error('Error finding membership:', fetchError);
      return res.status(404).json({ error: 'No active membership found' });
    }

    const { error: updateError } = await supabase
      .from('memberships')
      .update({ rules_acknowledged_at: new Date().toISOString() })
      .eq('id', membership.id);

    if (updateError) {
      console.error('Error acknowledging rules:', updateError);
      return res.status(500).json({ error: 'Failed to save acknowledgment' });
    }

    console.log(`User ${userId} acknowledged community rules`);
    res.json({ success: true, acknowledged_at: new Date().toISOString() });

  } catch (error) {
    console.error('Acknowledge rules error:', error);
    res.status(500).json({ error: 'Failed to acknowledge rules' });
  }
});

module.exports = router;
