/**
 * Analytics Service
 * Server-side helper for tracking analytics events
 */

const { supabase } = require('./supabase');
const { logger } = require('./logger');
const crypto = require('crypto');

/**
 * Hash IP address for privacy
 */
function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip + (process.env.IP_HASH_SALT || 'vixxxen-salt')).digest('hex').substring(0, 16);
}

/**
 * Extract IP from request
 */
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.ip;
}

/**
 * Track an analytics event from server-side
 * @param {string} eventName - Name of the event
 * @param {string} eventCategory - Category (generation, character, etc.)
 * @param {object} eventData - Event payload
 * @param {object} req - Express request object (for user context)
 */
async function trackEvent(eventName, eventCategory, eventData = {}, req = null) {
  if (!supabase) {
    logger.debug('Analytics: Supabase not configured, skipping event', { eventName });
    return false;
  }

  try {
    const record = {
      event_name: eventName,
      event_category: eventCategory,
      event_data: eventData,
      user_id: req?.userId || null,
      session_id: req?.headers['x-session-id'] || null,
      page_url: req?.headers['referer'] || null,
      user_agent: req?.headers['user-agent'] || null,
      ip_hash: req ? hashIp(getClientIp(req)) : null
    };

    const { error } = await supabase
      .from('analytics_events')
      .insert(record);

    if (error) {
      logger.debug('Analytics: Failed to track event', { eventName, error: error.message });
      return false;
    }

    return true;
  } catch (error) {
    logger.debug('Analytics: Error tracking event', { eventName, error: error.message });
    return false;
  }
}

/**
 * Track generation events
 */
const generation = {
  started: (model, data = {}, req = null) => {
    return trackEvent('generation_started', 'generation', { model, ...data }, req);
  },

  completed: (model, data = {}, req = null) => {
    return trackEvent('generation_completed', 'generation', { model, ...data }, req);
  },

  failed: (model, error, data = {}, req = null) => {
    return trackEvent('generation_failed', 'generation', { model, error, ...data }, req);
  }
};

/**
 * Track character events
 */
const character = {
  creationStarted: (data = {}, req = null) => {
    return trackEvent('character_creation_started', 'character', data, req);
  },

  imagesUploaded: (count, data = {}, req = null) => {
    return trackEvent('character_images_uploaded', 'character', { image_count: count, ...data }, req);
  },

  submitted: (data = {}, req = null) => {
    return trackEvent('character_submitted', 'character', data, req);
  },

  trainingCompleted: (characterId, data = {}, req = null) => {
    return trackEvent('character_training_completed', 'character', { character_id: characterId, ...data }, req);
  },

  purchased: (characterId, price, data = {}, req = null) => {
    return trackEvent('character_purchased', 'character', { character_id: characterId, price, ...data }, req);
  }
};

/**
 * Track chat events
 */
const chat = {
  joined: (channelName, tier, data = {}, req = null) => {
    return trackEvent('chat_joined', 'chat', { channel: channelName, tier, ...data }, req);
  },

  messageSent: (channelName, data = {}, req = null) => {
    return trackEvent('chat_message_sent', 'chat', { channel: channelName, ...data }, req);
  }
};

/**
 * Track monetization events
 */
const monetization = {
  checkoutStarted: (planName, amount, data = {}, req = null) => {
    return trackEvent('checkout_started', 'monetization', { plan: planName, amount, ...data }, req);
  },

  checkoutCompleted: (planName, amount, method, data = {}, req = null) => {
    return trackEvent('checkout_completed', 'monetization', { plan: planName, amount, method, ...data }, req);
  },

  subscriptionCancelled: (planName, reason, data = {}, req = null) => {
    return trackEvent('subscription_cancelled', 'monetization', { plan: planName, reason, ...data }, req);
  },

  creditsPurchased: (amount, data = {}, req = null) => {
    return trackEvent('credits_purchased', 'monetization', { amount, ...data }, req);
  }
};

module.exports = {
  trackEvent,
  generation,
  character,
  chat,
  monetization
};
