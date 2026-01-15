/**
 * Vixxxen Analytics Tracker
 * Lightweight internal analytics for tracking user behavior and funnels
 */
(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    endpoint: '/api/analytics/event',
    batchEndpoint: '/api/analytics/events',
    funnelEndpoint: '/api/analytics/funnel/update',
    sessionStartEndpoint: '/api/analytics/session/start',
    sessionHeartbeatEndpoint: '/api/analytics/session/heartbeat',
    sessionEndEndpoint: '/api/analytics/session/end',
    batchSize: 10,
    flushInterval: 5000, // 5 seconds
    heartbeatInterval: 30000, // 30 seconds
    debug: false
  };

  // Session management
  let sessionId = null;
  let anonymousId = null;
  let eventQueue = [];
  let flushTimer = null;
  let heartbeatTimer = null;
  let eventsInSession = 0;

  /**
   * Generate a UUID v4
   */
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Get or create session ID (persists for browser session)
   */
  function getSessionId() {
    if (sessionId) return sessionId;

    sessionId = sessionStorage.getItem('vx_session_id');
    if (!sessionId) {
      sessionId = generateUUID();
      sessionStorage.setItem('vx_session_id', sessionId);
    }
    return sessionId;
  }

  /**
   * Get or create anonymous ID (persists across sessions)
   */
  function getAnonymousId() {
    if (anonymousId) return anonymousId;

    anonymousId = localStorage.getItem('vx_anonymous_id');
    if (!anonymousId) {
      anonymousId = generateUUID();
      localStorage.setItem('vx_anonymous_id', anonymousId);
    }
    return anonymousId;
  }

  /**
   * Get auth token if user is logged in
   */
  function getAuthToken() {
    // Check for Supabase auth token
    const supabaseAuth = localStorage.getItem('sb-auth-token');
    if (supabaseAuth) {
      try {
        const parsed = JSON.parse(supabaseAuth);
        return parsed.access_token;
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Fallback to checking window.supabase if available
    if (window.supabase && window.supabase.auth) {
      const session = window.supabase.auth.session?.();
      if (session?.access_token) {
        return session.access_token;
      }
    }

    return null;
  }

  /**
   * Send events to backend
   */
  async function sendEvents(events) {
    if (events.length === 0) return;

    const token = getAuthToken();
    const headers = {
      'Content-Type': 'application/json'
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      if (events.length === 1) {
        // Single event
        await fetch(CONFIG.endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(events[0])
        });
      } else {
        // Batch events
        await fetch(CONFIG.batchEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ events })
        });
      }

      if (CONFIG.debug) {
        console.log('[Analytics] Sent', events.length, 'event(s)');
      }
    } catch (error) {
      if (CONFIG.debug) {
        console.error('[Analytics] Failed to send events:', error);
      }
      // Re-queue failed events (up to a limit)
      if (eventQueue.length < 100) {
        eventQueue.push(...events);
      }
    }
  }

  /**
   * Flush queued events
   */
  function flush() {
    if (eventQueue.length === 0) return;

    const eventsToSend = eventQueue.splice(0, CONFIG.batchSize);
    sendEvents(eventsToSend);
  }

  /**
   * Start the flush timer
   */
  function startFlushTimer() {
    if (flushTimer) return;
    flushTimer = setInterval(flush, CONFIG.flushInterval);
  }

  /**
   * Stop the flush timer
   */
  function stopFlushTimer() {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
  }

  /**
   * Start session tracking
   */
  async function startSessionTracking() {
    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      await fetch(CONFIG.sessionStartEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          session_id: getSessionId(),
          anonymous_id: getAnonymousId(),
          page_url: window.location.href,
          referrer: document.referrer
        })
      });

      if (CONFIG.debug) {
        console.log('[Analytics] Session started');
      }

      // Start heartbeat timer
      startHeartbeat();
    } catch (error) {
      if (CONFIG.debug) {
        console.error('[Analytics] Failed to start session:', error);
      }
    }
  }

  /**
   * Send session heartbeat
   */
  async function sendHeartbeat() {
    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      await fetch(CONFIG.sessionHeartbeatEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          session_id: getSessionId(),
          page_url: window.location.href,
          events_count: eventsInSession
        })
      });

      if (CONFIG.debug) {
        console.log('[Analytics] Heartbeat sent');
      }
    } catch (error) {
      // Silently fail heartbeats
    }
  }

  /**
   * Start the heartbeat timer
   */
  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(sendHeartbeat, CONFIG.heartbeatInterval);
  }

  /**
   * Stop the heartbeat timer
   */
  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  /**
   * End session tracking
   */
  async function endSessionTracking() {
    stopHeartbeat();

    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      // Use sendBeacon for reliability on page unload
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ session_id: getSessionId() })], { type: 'application/json' });
        navigator.sendBeacon(CONFIG.sessionEndEndpoint, blob);
      } else {
        await fetch(CONFIG.sessionEndEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ session_id: getSessionId() })
        });
      }
    } catch (error) {
      // Silently fail on session end
    }
  }

  /**
   * Track an event
   * @param {string} eventName - Name of the event
   * @param {string} eventCategory - Category (onboarding, trial, generation, etc.)
   * @param {object} eventData - Additional event data
   * @param {boolean} immediate - Send immediately instead of batching
   */
  function track(eventName, eventCategory, eventData = {}, immediate = false) {
    const event = {
      event_name: eventName,
      event_category: eventCategory,
      event_data: eventData,
      anonymous_id: getAnonymousId(),
      session_id: getSessionId(),
      page_url: window.location.href,
      referrer: document.referrer,
      timestamp: new Date().toISOString()
    };

    if (CONFIG.debug) {
      console.log('[Analytics] Track:', eventName, eventCategory, eventData);
    }

    // Increment session event counter
    eventsInSession++;

    if (immediate) {
      sendEvents([event]);
    } else {
      eventQueue.push(event);
      startFlushTimer();

      // Flush if queue is getting large
      if (eventQueue.length >= CONFIG.batchSize) {
        flush();
      }
    }
  }

  /**
   * Update funnel progress
   * @param {string} funnelName - Name of the funnel
   * @param {string} currentStep - Current step in the funnel
   * @param {object} options - Additional options
   */
  async function updateFunnel(funnelName, currentStep, options = {}) {
    const {
      stepCompleted = null,
      funnelData = {},
      completed = false,
      abandoned = false
    } = options;

    const token = getAuthToken();
    const headers = {
      'Content-Type': 'application/json'
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const payload = {
      funnel_name: funnelName,
      current_step: currentStep,
      step_completed: stepCompleted,
      anonymous_id: getAnonymousId(),
      funnel_data: funnelData,
      completed,
      abandoned
    };

    if (CONFIG.debug) {
      console.log('[Analytics] Funnel update:', funnelName, currentStep, options);
    }

    try {
      await fetch(CONFIG.funnelEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (CONFIG.debug) {
        console.error('[Analytics] Failed to update funnel:', error);
      }
    }
  }

  // ===========================================
  // CONVENIENCE METHODS FOR COMMON EVENTS
  // ===========================================

  /**
   * Track onboarding events
   */
  const onboarding = {
    started: (data = {}) => {
      track('onboarding_started', 'onboarding', data, true);
      updateFunnel('onboarding', 'started');
    },
    stepViewed: (stepName, data = {}) => {
      track('onboarding_step_viewed', 'onboarding', { step: stepName, ...data });
      updateFunnel('onboarding', stepName);
    },
    stepCompleted: (stepName, data = {}) => {
      track('onboarding_step_completed', 'onboarding', { step: stepName, ...data });
      updateFunnel('onboarding', stepName, { stepCompleted: stepName, funnelData: data });
    },
    stepSkipped: (stepName, data = {}) => {
      track('onboarding_step_skipped', 'onboarding', { step: stepName, ...data });
    },
    completed: (data = {}) => {
      track('onboarding_completed', 'onboarding', data, true);
      updateFunnel('onboarding', 'completed', { completed: true, funnelData: data });
    },
    abandoned: (stepName, data = {}) => {
      track('onboarding_abandoned', 'onboarding', { last_step: stepName, ...data });
      updateFunnel('onboarding', stepName, { abandoned: true });
    }
  };

  /**
   * Track trial events
   */
  const trial = {
    started: (data = {}) => {
      track('trial_started', 'trial', data, true);
      updateFunnel('trial', 'started');
    },
    generationUsed: (generationNumber, data = {}) => {
      track('trial_generation_used', 'trial', { generation_number: generationNumber, ...data });
      updateFunnel('trial', `generation_${generationNumber}`, {
        stepCompleted: `generation_${generationNumber}`,
        funnelData: data
      });
    },
    completed: (data = {}) => {
      track('trial_completed', 'trial', data, true);
      updateFunnel('trial', 'completed', { completed: true, funnelData: data });
    },
    converted: (data = {}) => {
      track('trial_converted', 'trial', data, true);
    }
  };

  /**
   * Track generation events
   */
  const generation = {
    started: (model, data = {}) => {
      track('generation_started', 'generation', { model, ...data });
    },
    completed: (model, data = {}) => {
      track('generation_completed', 'generation', { model, ...data });
    },
    failed: (model, error, data = {}) => {
      track('generation_failed', 'generation', { model, error, ...data });
    }
  };

  /**
   * Track character events
   */
  const character = {
    creationStarted: (data = {}) => {
      track('character_creation_started', 'character', data, true);
      updateFunnel('character_creation', 'started');
    },
    imagesUploaded: (count, data = {}) => {
      track('character_images_uploaded', 'character', { image_count: count, ...data });
      updateFunnel('character_creation', 'images_uploaded', {
        stepCompleted: 'images_uploaded',
        funnelData: { image_count: count, ...data }
      });
    },
    detailsEntered: (data = {}) => {
      track('character_details_entered', 'character', data);
      updateFunnel('character_creation', 'details_entered', { stepCompleted: 'details_entered' });
    },
    styleSelected: (style, data = {}) => {
      track('character_style_selected', 'character', { style, ...data });
      updateFunnel('character_creation', 'style_selected', { stepCompleted: 'style_selected' });
    },
    submitted: (data = {}) => {
      track('character_submitted', 'character', data, true);
      updateFunnel('character_creation', 'submitted', { stepCompleted: 'submitted' });
    },
    trainingCompleted: (characterId, data = {}) => {
      track('character_training_completed', 'character', { character_id: characterId, ...data }, true);
      updateFunnel('character_creation', 'completed', { completed: true });
    },
    viewed: (characterId, data = {}) => {
      track('character_viewed', 'character', { character_id: characterId, ...data });
    },
    purchased: (characterId, price, data = {}) => {
      track('character_purchased', 'character', { character_id: characterId, price, ...data }, true);
    },
    used: (characterId, model, data = {}) => {
      track('character_used', 'character', { character_id: characterId, model, ...data });
    }
  };

  /**
   * Track chat events
   */
  const chat = {
    joined: (channelName, tier, data = {}) => {
      track('chat_joined', 'chat', { channel: channelName, tier, ...data });
    },
    messageSent: (channelName, data = {}) => {
      track('chat_message_sent', 'chat', { channel: channelName, ...data });
    },
    mentorOpened: (data = {}) => {
      track('mentor_channel_opened', 'chat', data);
    },
    mentorMessage: (data = {}) => {
      track('mentor_message_sent', 'chat', data);
    }
  };

  /**
   * Track monetization events
   */
  const monetization = {
    pricingViewed: (data = {}) => {
      track('pricing_viewed', 'monetization', data);
      updateFunnel('checkout', 'pricing_viewed');
    },
    planSelected: (planName, data = {}) => {
      track('plan_selected', 'monetization', { plan: planName, ...data });
      updateFunnel('checkout', 'plan_selected', { stepCompleted: 'plan_selected', funnelData: { plan: planName } });
    },
    checkoutStarted: (planName, amount, data = {}) => {
      track('checkout_started', 'monetization', { plan: planName, amount, ...data }, true);
      updateFunnel('checkout', 'checkout_started', { stepCompleted: 'checkout_started' });
    },
    checkoutCompleted: (planName, amount, method, data = {}) => {
      track('checkout_completed', 'monetization', { plan: planName, amount, method, ...data }, true);
      updateFunnel('checkout', 'completed', { completed: true, funnelData: { plan: planName, amount, method } });
    },
    checkoutAbandoned: (planName, data = {}) => {
      track('checkout_abandoned', 'monetization', { plan: planName, ...data });
      updateFunnel('checkout', 'abandoned', { abandoned: true });
    },
    subscriptionUpgraded: (fromPlan, toPlan, data = {}) => {
      track('subscription_upgraded', 'monetization', { from_plan: fromPlan, to_plan: toPlan, ...data }, true);
    },
    subscriptionCancelled: (planName, reason, data = {}) => {
      track('subscription_cancelled', 'monetization', { plan: planName, reason, ...data }, true);
    },
    creditsPurchased: (amount, data = {}) => {
      track('credits_purchased', 'monetization', { amount, ...data }, true);
    }
  };

  /**
   * Track session events
   */
  const session = {
    started: (data = {}) => {
      track('session_started', 'session', {
        referrer: document.referrer,
        landing_page: window.location.pathname,
        ...data
      }, true);
    },
    pageViewed: (pageName, data = {}) => {
      track('page_viewed', 'session', { page: pageName, path: window.location.pathname, ...data });
    }
  };

  // ===========================================
  // LIFECYCLE
  // ===========================================

  /**
   * Initialize tracker
   */
  function init(options = {}) {
    // Merge options
    Object.assign(CONFIG, options);

    // Track session start
    const isNewSession = !sessionStorage.getItem('vx_session_started');
    if (isNewSession) {
      sessionStorage.setItem('vx_session_started', 'true');
      session.started();
      // Start server-side session tracking
      startSessionTracking();
    }

    // Flush and end session on page unload
    window.addEventListener('beforeunload', () => {
      flush();
      endSessionTracking();
    });

    // Flush on visibility change (when user switches tabs)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flush();
        sendHeartbeat(); // Send final heartbeat when tab hidden
      }
    });

    if (CONFIG.debug) {
      console.log('[Analytics] Initialized', {
        sessionId: getSessionId(),
        anonymousId: getAnonymousId()
      });
    }
  }

  // ===========================================
  // EXPORT
  // ===========================================

  window.VxAnalytics = {
    init,
    track,
    updateFunnel,
    flush,

    // Convenience methods
    onboarding,
    trial,
    generation,
    character,
    chat,
    monetization,
    session,

    // Utilities
    getSessionId,
    getAnonymousId,

    // Config
    setDebug: (enabled) => { CONFIG.debug = enabled; }
  };

  // Auto-initialize if not in test environment
  if (typeof window !== 'undefined' && !window.__VIXXXEN_TEST__) {
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => init());
    } else {
      init();
    }
  }

})();
