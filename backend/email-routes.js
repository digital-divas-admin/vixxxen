/**
 * Email Routes for Vixxxen
 * Handles welcome emails and admin email testing
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const { logger } = require('./services/logger');
const {
  sendWelcomeEmail,
  sendSubscriptionEmail,
  sendPaymentReceiptEmail,
  sendExpirationReminderEmail,
  isEmailConfigured,
} = require('./email');

const router = express.Router();

// Initialize Supabase with service role key
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GET /api/email/status
 * Check if email service is configured
 */
router.get('/status', (req, res) => {
  res.json({
    configured: isEmailConfigured(),
    from: process.env.EMAIL_FROM || 'Not set',
  });
});

/**
 * POST /api/email/welcome
 * Send welcome email to the authenticated user
 * Called by frontend after successful signup
 */
router.post('/welcome', requireAuth, async (req, res) => {
  if (!isEmailConfigured()) {
    return res.status(503).json({ error: 'Email service not configured' });
  }

  try {
    const userId = req.userId;

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, full_name, display_name')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.email) {
      return res.status(400).json({ error: 'User profile or email not found' });
    }

    const result = await sendWelcomeEmail(
      profile.email,
      profile.display_name || profile.full_name
    );

    if (result.success) {
      res.json({ success: true, message: 'Welcome email sent' });
    } else {
      res.status(500).json({ error: 'Failed to send welcome email', details: result.error });
    }
  } catch (error) {
    logger.error('Error sending welcome email', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to send welcome email' });
  }
});

/**
 * POST /api/email/admin/test
 * Send a test email (admin only)
 * Body: { type: 'welcome'|'subscription'|'receipt'|'reminder', email: string }
 */
router.post('/admin/test', requireAdmin, async (req, res) => {
  if (!isEmailConfigured()) {
    return res.status(503).json({ error: 'Email service not configured' });
  }

  const { type, email } = req.body;

  if (!email || !type) {
    return res.status(400).json({ error: 'Email and type are required' });
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    let result;
    const testName = 'Test User';

    switch (type) {
      case 'welcome':
        result = await sendWelcomeEmail(email, testName);
        break;

      case 'subscription':
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        result = await sendSubscriptionEmail(email, testName, 'supernova', expiresAt.toISOString());
        break;

      case 'receipt':
        result = await sendPaymentReceiptEmail(email, testName, 25.00, 'USD', 'supernova', 'TEST-TXN-123');
        break;

      case 'reminder':
        const reminderDate = new Date();
        reminderDate.setDate(reminderDate.getDate() + 3);
        result = await sendExpirationReminderEmail(email, testName, 'supernova', reminderDate.toISOString());
        break;

      default:
        return res.status(400).json({ error: 'Invalid email type. Use: welcome, subscription, receipt, or reminder' });
    }

    if (result.success) {
      res.json({ success: true, message: `Test ${type} email sent to ${email}` });
    } else {
      res.status(500).json({ error: 'Failed to send test email', details: result.error });
    }
  } catch (error) {
    logger.error('Error sending test email', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to send test email', details: error.message });
  }
});

/**
 * POST /api/email/admin/send-reminders
 * Send expiration reminder emails to users expiring within N days (admin only)
 * Body: { days: number } - default 7
 */
router.post('/admin/send-reminders', requireAdmin, async (req, res) => {
  if (!isEmailConfigured()) {
    return res.status(503).json({ error: 'Email service not configured' });
  }

  const { days = 7 } = req.body;

  try {
    // Find memberships expiring within the specified days
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const { data: expiringMemberships, error } = await supabase
      .from('memberships')
      .select(`
        id,
        tier,
        expires_at,
        user_id,
        profiles!inner(email, full_name, display_name)
      `)
      .eq('is_active', true)
      .not('expires_at', 'is', null)
      .lte('expires_at', futureDate.toISOString())
      .gt('expires_at', new Date().toISOString());

    if (error) {
      logger.error('Error fetching expiring memberships', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch expiring memberships' });
    }

    if (!expiringMemberships || expiringMemberships.length === 0) {
      return res.json({ success: true, sent: 0, message: 'No expiring memberships found' });
    }

    let sent = 0;
    let failed = 0;

    for (const membership of expiringMemberships) {
      const profile = membership.profiles;
      if (!profile?.email) continue;

      const result = await sendExpirationReminderEmail(
        profile.email,
        profile.display_name || profile.full_name,
        membership.tier,
        membership.expires_at
      );

      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    }

    res.json({
      success: true,
      sent,
      failed,
      total: expiringMemberships.length,
      message: `Sent ${sent} reminder emails (${failed} failed)`,
    });
  } catch (error) {
    logger.error('Error sending reminder emails', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to send reminder emails' });
  }
});

module.exports = router;
