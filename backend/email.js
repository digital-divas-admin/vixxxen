/**
 * Email Service Module for Vixxxen
 * Uses Resend for transactional emails
 */

const { Resend } = require('resend');
const { logger, maskEmail } = require('./services/logger');

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Email configuration
const EMAIL_CONFIG = {
  from: process.env.EMAIL_FROM || 'Vixxxen <noreply@vixxxen.com>',
  replyTo: process.env.EMAIL_REPLY_TO || 'support@vixxxen.com',
};

// Brand colors for emails
const BRAND = {
  primary: '#ff2ebb',
  secondary: '#9d4edd',
  background: '#0a0a0f',
  cardBg: '#14141f',
  text: '#ffffff',
  textMuted: '#888888',
};

/**
 * Base email template wrapper
 */
function emailTemplate(title, content) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.background}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom: 30px;">
              <h1 style="margin: 0; font-size: 32px; font-weight: 700; color: ${BRAND.primary};">
                Vixxxen
              </h1>
            </td>
          </tr>

          <!-- Content Card -->
          <tr>
            <td style="background-color: ${BRAND.cardBg}; border-radius: 16px; padding: 40px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top: 30px;">
              <p style="margin: 0; font-size: 12px; color: ${BRAND.textMuted};">
                &copy; ${new Date().getFullYear()} Vixxxen. All rights reserved.
              </p>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: ${BRAND.textMuted};">
                You received this email because you have an account with Vixxxen.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * Send welcome email to new users
 */
async function sendWelcomeEmail(email, name) {
  const displayName = name || email.split('@')[0];

  const content = `
    <h2 style="margin: 0 0 20px 0; font-size: 24px; color: ${BRAND.text};">
      Welcome to Vixxxen, ${displayName}! 🎉
    </h2>

    <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.text};">
      We're thrilled to have you join our creative community! You now have access to powerful AI tools to bring your imagination to life.
    </p>

    <div style="background: linear-gradient(135deg, ${BRAND.primary}22, ${BRAND.secondary}22); border-radius: 12px; padding: 20px; margin: 25px 0;">
      <h3 style="margin: 0 0 15px 0; font-size: 18px; color: ${BRAND.primary};">
        🎁 Your Welcome Bonus
      </h3>
      <p style="margin: 0; font-size: 16px; color: ${BRAND.text};">
        You've received <strong style="color: ${BRAND.primary};">20 free credits</strong> to start creating!
      </p>
    </div>

    <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.text};">
      Here's what you can do:
    </p>

    <ul style="margin: 0 0 25px 0; padding-left: 20px; font-size: 15px; line-height: 1.8; color: ${BRAND.text};">
      <li>Generate stunning AI images with multiple models</li>
      <li>Create AI-powered videos</li>
      <li>Chat with our creative community</li>
      <li>Access exclusive tutorials and resources</li>
    </ul>

    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding-top: 10px;">
          <a href="${process.env.FRONTEND_URL || 'https://vixxxen.com'}"
             style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary}); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Start Creating
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 30px 0 0 0; font-size: 14px; color: ${BRAND.textMuted};">
      Questions? Reply to this email or join our community chat!
    </p>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: email,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `Welcome to Vixxxen, ${displayName}! 🎉`,
      html: emailTemplate('Welcome to Vixxxen', content),
    });

    if (error) {
      logger.error('Failed to send welcome email', { error: error.message, email: maskEmail(email) });
      return { success: false, error };
    }

    logger.info('Welcome email sent', { email: maskEmail(email) });
    return { success: true, data };
  } catch (err) {
    logger.error('Error sending welcome email', { error: err.message, email: maskEmail(email) });
    return { success: false, error: err.message };
  }
}

/**
 * Send subscription confirmation email
 */
async function sendSubscriptionEmail(email, name, tier, expiresAt) {
  const displayName = name || email.split('@')[0];
  const tierName = tier === 'mentorship' ? 'Mentorship' : 'Supernova';
  const tierEmoji = tier === 'mentorship' ? '🌟' : '⭐';

  const benefits = tier === 'mentorship'
    ? [
        'All Supernova benefits included',
        'Private mentorship channels',
        'Exclusive advanced tutorials',
        'Direct access to expert creators',
        'Priority support',
      ]
    : [
        'Access to Supernova chat channels',
        'Exclusive tutorials and guides',
        'Premium resource library',
        'Community showcase access',
      ];

  const expiryText = expiresAt
    ? `Your subscription is active until <strong>${new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>.`
    : 'Your subscription is now active!';

  const content = `
    <h2 style="margin: 0 0 20px 0; font-size: 24px; color: ${BRAND.text};">
      ${tierEmoji} Welcome to ${tierName}!
    </h2>

    <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.text};">
      Hey ${displayName}, congratulations on upgrading to <strong style="color: ${BRAND.primary};">${tierName}</strong>!
    </p>

    <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.text};">
      ${expiryText}
    </p>

    <div style="background: linear-gradient(135deg, ${BRAND.primary}22, ${BRAND.secondary}22); border-radius: 12px; padding: 20px; margin: 25px 0;">
      <h3 style="margin: 0 0 15px 0; font-size: 18px; color: ${BRAND.primary};">
        Your ${tierName} Benefits
      </h3>
      <ul style="margin: 0; padding-left: 20px; font-size: 15px; line-height: 1.8; color: ${BRAND.text};">
        ${benefits.map(b => `<li>${b}</li>`).join('')}
      </ul>
    </div>

    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding-top: 10px;">
          <a href="${process.env.FRONTEND_URL || 'https://vixxxen.com'}"
             style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary}); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Access Your Benefits
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 30px 0 0 0; font-size: 14px; color: ${BRAND.textMuted};">
      Thank you for supporting Vixxxen! If you have any questions, just reply to this email.
    </p>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: email,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `${tierEmoji} Welcome to ${tierName} - Your subscription is active!`,
      html: emailTemplate(`${tierName} Subscription`, content),
    });

    if (error) {
      logger.error('Failed to send subscription email', { error: error.message, email: maskEmail(email) });
      return { success: false, error };
    }

    logger.info('Subscription email sent', { email: maskEmail(email), tier });
    return { success: true, data };
  } catch (err) {
    logger.error('Error sending subscription email', { error: err.message, email: maskEmail(email) });
    return { success: false, error: err.message };
  }
}

/**
 * Send payment receipt email
 */
async function sendPaymentReceiptEmail(email, name, amount, currency, tier, transactionId) {
  const displayName = name || email.split('@')[0];
  const tierName = tier === 'mentorship' ? 'Mentorship' : 'Supernova';

  const content = `
    <h2 style="margin: 0 0 20px 0; font-size: 24px; color: ${BRAND.text};">
      Payment Received ✓
    </h2>

    <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.text};">
      Hi ${displayName}, thank you for your payment! Here are your receipt details:
    </p>

    <div style="background: ${BRAND.background}; border-radius: 12px; padding: 25px; margin: 25px 0; border: 1px solid #333;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: ${BRAND.textMuted};">Subscription</td>
          <td style="padding: 8px 0; font-size: 14px; color: ${BRAND.text}; text-align: right;">${tierName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: ${BRAND.textMuted};">Amount</td>
          <td style="padding: 8px 0; font-size: 14px; color: ${BRAND.text}; text-align: right;">${currency} ${amount}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: ${BRAND.textMuted};">Date</td>
          <td style="padding: 8px 0; font-size: 14px; color: ${BRAND.text}; text-align: right;">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
        </tr>
        ${transactionId ? `
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: ${BRAND.textMuted};">Transaction ID</td>
          <td style="padding: 8px 0; font-size: 12px; color: ${BRAND.text}; text-align: right; font-family: monospace;">${transactionId}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.text};">
      Your ${tierName} subscription is now active. Enjoy all your premium benefits!
    </p>

    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding-top: 10px;">
          <a href="${process.env.FRONTEND_URL || 'https://vixxxen.com'}"
             style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary}); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Go to Vixxxen
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 30px 0 0 0; font-size: 14px; color: ${BRAND.textMuted};">
      Keep this email for your records. If you have any questions about your payment, please contact us.
    </p>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: email,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `Payment Receipt - ${tierName} Subscription`,
      html: emailTemplate('Payment Receipt', content),
    });

    if (error) {
      logger.error('Failed to send payment receipt', { error: error.message, email: maskEmail(email) });
      return { success: false, error };
    }

    logger.info('Payment receipt sent', { email: maskEmail(email), tier });
    return { success: true, data };
  } catch (err) {
    logger.error('Error sending payment receipt', { error: err.message, email: maskEmail(email) });
    return { success: false, error: err.message };
  }
}

/**
 * Send subscription expiring reminder
 */
async function sendExpirationReminderEmail(email, name, tier, expiresAt) {
  const displayName = name || email.split('@')[0];
  const tierName = tier === 'mentorship' ? 'Mentorship' : 'Supernova';
  const daysLeft = Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24));

  const content = `
    <h2 style="margin: 0 0 20px 0; font-size: 24px; color: ${BRAND.text};">
      Your ${tierName} subscription expires soon
    </h2>

    <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.text};">
      Hey ${displayName}, just a heads up that your ${tierName} subscription will expire in <strong style="color: ${BRAND.primary};">${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>.
    </p>

    <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: ${BRAND.text};">
      Renew now to keep access to all your premium benefits without interruption.
    </p>

    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding-top: 10px;">
          <a href="${process.env.FRONTEND_URL || 'https://vixxxen.com'}/membership"
             style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary}); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Renew Now
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 30px 0 0 0; font-size: 14px; color: ${BRAND.textMuted};">
      If you have any questions, just reply to this email.
    </p>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: email,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `⏰ Your ${tierName} subscription expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
      html: emailTemplate('Subscription Reminder', content),
    });

    if (error) {
      logger.error('Failed to send expiration reminder', { error: error.message, email: maskEmail(email) });
      return { success: false, error };
    }

    logger.info('Expiration reminder sent', { email: maskEmail(email), daysLeft });
    return { success: true, data };
  } catch (err) {
    logger.error('Error sending expiration reminder', { error: err.message, email: maskEmail(email) });
    return { success: false, error: err.message };
  }
}

/**
 * Check if email service is configured
 */
function isEmailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

module.exports = {
  sendWelcomeEmail,
  sendSubscriptionEmail,
  sendPaymentReceiptEmail,
  sendExpirationReminderEmail,
  isEmailConfigured,
};
