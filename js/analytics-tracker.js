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
    debug: false,
    enrichEvents: true // Auto-enrich events with device/user context
  };

  // Cached user context (refreshed on auth changes)
  let cachedUserContext = null;
  let userContextCacheTime = 0;
  const USER_CONTEXT_CACHE_TTL = 60000; // 1 minute

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
   * Detect device type from user agent
   * @returns {string} 'mobile' | 'tablet' | 'desktop'
   */
  function getDeviceType() {
    const ua = navigator.userAgent.toLowerCase();

    // Check for tablets first (some tablets have 'mobile' in UA)
    const isTablet = /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP))))/.test(ua);
    if (isTablet) return 'tablet';

    // Check for mobile devices
    const isMobile = /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(ua);
    if (isMobile) return 'mobile';

    return 'desktop';
  }

  /**
   * Get browser name from user agent
   * @returns {string} Browser name
   */
  function getBrowserName() {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) return 'firefox';
    if (ua.includes('SamsungBrowser')) return 'samsung';
    if (ua.includes('Opera') || ua.includes('OPR')) return 'opera';
    if (ua.includes('Edge')) return 'edge';
    if (ua.includes('Edg')) return 'edge-chromium';
    if (ua.includes('Chrome')) return 'chrome';
    if (ua.includes('Safari')) return 'safari';
    return 'other';
  }

  /**
   * Get user context (tier, trial status, days since signup)
   * Caches result to avoid repeated lookups
   * @returns {object} User context data
   */
  function getUserContext() {
    const now = Date.now();

    // Return cached context if still valid
    if (cachedUserContext && (now - userContextCacheTime) < USER_CONTEXT_CACHE_TTL) {
      return cachedUserContext;
    }

    const context = {
      user_tier: 'anonymous',
      is_trial: false,
      is_logged_in: false,
      days_since_signup: null
    };

    try {
      // Check for user data in various places
      // 1. Check window.currentUser (set by app)
      if (window.currentUser) {
        context.is_logged_in = true;
        context.user_tier = window.currentUser.tier || window.currentUser.subscription_tier || 'free';
        context.is_trial = window.currentUser.is_trial || window.currentUser.trial_active || false;

        if (window.currentUser.created_at) {
          const signupDate = new Date(window.currentUser.created_at);
          const daysSince = Math.floor((now - signupDate.getTime()) / (1000 * 60 * 60 * 24));
          context.days_since_signup = daysSince;
        }
      }

      // 2. Check localStorage for cached user info
      const cachedUser = localStorage.getItem('vx_user_info');
      if (cachedUser && !context.is_logged_in) {
        try {
          const userData = JSON.parse(cachedUser);
          context.is_logged_in = true;
          context.user_tier = userData.tier || userData.subscription_tier || 'free';
          context.is_trial = userData.is_trial || userData.trial_active || false;

          if (userData.created_at) {
            const signupDate = new Date(userData.created_at);
            const daysSince = Math.floor((now - signupDate.getTime()) / (1000 * 60 * 60 * 24));
            context.days_since_signup = daysSince;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      // 3. Check Supabase session for basic logged-in state
      if (!context.is_logged_in) {
        const supabaseAuth = localStorage.getItem('sb-auth-token');
        if (supabaseAuth) {
          context.is_logged_in = true;
          context.user_tier = 'free'; // Default, will be updated when full user data loads
        }
      }
    } catch (e) {
      if (CONFIG.debug) {
        console.error('[Analytics] Error getting user context:', e);
      }
    }

    // Cache the context
    cachedUserContext = context;
    userContextCacheTime = now;

    return context;
  }

  /**
   * Clear cached user context (call on login/logout/tier change)
   */
  function clearUserContextCache() {
    cachedUserContext = null;
    userContextCacheTime = 0;
  }

  /**
   * Update cached user context with new data
   * @param {object} userData - User data to cache
   */
  function updateUserContext(userData) {
    if (!userData) return;

    // Store in localStorage for persistence
    try {
      localStorage.setItem('vx_user_info', JSON.stringify({
        tier: userData.tier || userData.subscription_tier,
        is_trial: userData.is_trial || userData.trial_active,
        created_at: userData.created_at
      }));
    } catch (e) {
      // Ignore storage errors
    }

    // Clear cache to force refresh
    clearUserContextCache();
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
    // Increment session event counter first
    eventsInSession++;

    // Auto-enrich event data with device and user context
    let enrichedEventData = { ...eventData };

    if (CONFIG.enrichEvents) {
      const userContext = getUserContext();

      // Add device context
      enrichedEventData.device_type = enrichedEventData.device_type || getDeviceType();
      enrichedEventData.browser = enrichedEventData.browser || getBrowserName();

      // Add user context
      enrichedEventData.user_tier = enrichedEventData.user_tier || userContext.user_tier;
      enrichedEventData.is_trial = enrichedEventData.is_trial !== undefined ? enrichedEventData.is_trial : userContext.is_trial;
      enrichedEventData.is_logged_in = enrichedEventData.is_logged_in !== undefined ? enrichedEventData.is_logged_in : userContext.is_logged_in;

      if (userContext.days_since_signup !== null) {
        enrichedEventData.days_since_signup = enrichedEventData.days_since_signup || userContext.days_since_signup;
      }

      // Add session context
      enrichedEventData.session_event_number = eventsInSession;

      // Add screen dimensions for device context
      enrichedEventData.screen_width = enrichedEventData.screen_width || window.screen.width;
      enrichedEventData.viewport_width = enrichedEventData.viewport_width || window.innerWidth;
    }

    const event = {
      event_name: eventName,
      event_category: eventCategory,
      event_data: enrichedEventData,
      anonymous_id: getAnonymousId(),
      session_id: getSessionId(),
      page_url: window.location.href,
      referrer: document.referrer,
      timestamp: new Date().toISOString()
    };

    if (CONFIG.debug) {
      console.log('[Analytics] Track:', eventName, eventCategory, enrichedEventData);
    }

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
      // Also track first attempt milestone
      generation.firstAttempted(model, data);
    },
    completed: (model, data = {}) => {
      track('generation_completed', 'generation', { model, ...data });
      // Also track first success milestone
      generation.firstSuccess(model, data);
    },
    failed: (model, error, data = {}) => {
      track('generation_failed', 'generation', { model, error, ...data });
      // Track first failure if this is user's first generation attempt
      generation.firstFailed(model, error, data);
    },
    // Track first generation milestone
    firstAttempted: (model, data = {}) => {
      // Only track if this is actually the first
      if (localStorage.getItem('vx_first_gen_tracked')) return;
      localStorage.setItem('vx_first_gen_tracked', 'true');
      localStorage.setItem('vx_first_gen_timestamp', Date.now().toString());
      track('first_generation_attempted', 'generation', { model, ...data }, true);
      // Update funnel
      updateFunnel('signup_to_value', 'first_generation_attempted', {
        stepCompleted: 'first_generation_attempted',
        funnelData: { model }
      });
    },
    firstSuccess: (model, data = {}) => {
      // Only track if this is actually the first success
      if (localStorage.getItem('vx_first_gen_success_tracked')) return;
      localStorage.setItem('vx_first_gen_success_tracked', 'true');

      // Calculate time from first attempt to first success
      const firstAttemptTime = localStorage.getItem('vx_first_gen_timestamp');
      let timeToSuccess = null;
      if (firstAttemptTime) {
        timeToSuccess = Math.round((Date.now() - parseInt(firstAttemptTime)) / 1000);
      }

      track('first_generation_success', 'generation', {
        model,
        time_to_success_seconds: timeToSuccess,
        ...data
      }, true);

      // Update funnel
      updateFunnel('signup_to_value', 'first_generation_success', {
        stepCompleted: 'first_generation_success',
        funnelData: { model, time_to_success_seconds: timeToSuccess }
      });
    },
    firstFailed: (model, error, data = {}) => {
      // Only track if this is the first failure AND user hasn't had a success yet
      if (localStorage.getItem('vx_first_gen_failure_tracked')) return;
      if (localStorage.getItem('vx_first_gen_success_tracked')) return; // Already succeeded, don't track failure
      localStorage.setItem('vx_first_gen_failure_tracked', 'true');
      track('first_generation_failure', 'generation', { model, error, ...data }, true);
    },
    // Check if user has generated before
    hasGeneratedBefore: () => {
      return !!localStorage.getItem('vx_first_gen_tracked');
    },
    hasSuccessfulGeneration: () => {
      return !!localStorage.getItem('vx_first_gen_success_tracked');
    },
    // Get time since first generation attempt (for funnel analysis)
    getTimeSinceFirstAttempt: () => {
      const timestamp = localStorage.getItem('vx_first_gen_timestamp');
      if (!timestamp) return null;
      return Math.round((Date.now() - parseInt(timestamp)) / 1000);
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
    },
    // Paywall tracking
    paywallViewed: (triggerReason, data = {}) => {
      track('paywall_viewed', 'monetization', { trigger_reason: triggerReason, ...data });
    },
    paywallDismissed: (triggerReason, timeVisibleMs, data = {}) => {
      track('paywall_dismissed', 'monetization', {
        trigger_reason: triggerReason,
        time_visible_seconds: Math.round(timeVisibleMs / 1000),
        ...data
      });
    },
    paywallClickedUpgrade: (triggerReason, data = {}) => {
      track('paywall_clicked_upgrade', 'monetization', { trigger_reason: triggerReason, ...data }, true);
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
        landing_url: window.location.href,
        // Include UTM params if present
        utm_source: new URLSearchParams(window.location.search).get('utm_source'),
        utm_medium: new URLSearchParams(window.location.search).get('utm_medium'),
        utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
        ...data
      }, true);
    },
    pageViewed: (pageName, data = {}) => {
      track('page_viewed', 'session', { page: pageName, path: window.location.pathname, ...data });
    }
  };

  /**
   * Track engagement events (value moments, feature discovery, etc.)
   */
  const engagement = {
    // Track when user downloads/saves their first image (key value moment)
    valueMomentReached: (action, contentType, data = {}) => {
      // Only track first value moment
      if (localStorage.getItem('vx_value_moment_tracked')) return;
      localStorage.setItem('vx_value_moment_tracked', 'true');

      // Calculate time since first generation
      const firstGenTimestamp = localStorage.getItem('vx_first_gen_timestamp');
      let timeSinceFirstGen = null;
      if (firstGenTimestamp) {
        timeSinceFirstGen = Math.round((Date.now() - parseInt(firstGenTimestamp)) / 1000);
      }

      track('value_moment_reached', 'engagement', {
        action, // 'download', 'save', 'share'
        content_type: contentType, // 'image', 'video'
        time_since_first_gen_seconds: timeSinceFirstGen,
        ...data
      }, true);

      // Update funnel
      updateFunnel('signup_to_value', 'value_moment_reached', {
        stepCompleted: 'value_moment_reached',
        funnelData: { action, content_type: contentType, time_since_first_gen_seconds: timeSinceFirstGen }
      });
    },
    // Check if value moment has been reached
    hasReachedValueMoment: () => {
      return !!localStorage.getItem('vx_value_moment_tracked');
    },
    // Track feature discovery (first use of a feature)
    featureDiscovered: (featureName, data = {}) => {
      const key = `vx_feature_${featureName}_discovered`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, 'true');
      track('feature_discovered', 'engagement', { feature: featureName, ...data });
    },
    // Track content download (all downloads, not just first)
    downloaded: (contentType, data = {}) => {
      track('content_downloaded', 'engagement', { content_type: contentType, ...data });
      // Also track value moment if this is the first
      engagement.valueMomentReached('download', contentType, data);
    },
    // Track content saved to cloud storage
    saved: (contentType, data = {}) => {
      track('content_saved', 'engagement', { content_type: contentType, ...data });
      // Also track value moment if this is the first
      engagement.valueMomentReached('save', contentType, data);
    },
    // Track content shared
    shared: (contentType, platform, data = {}) => {
      track('content_shared', 'engagement', { content_type: contentType, platform, ...data });
      // Also track value moment if this is the first
      engagement.valueMomentReached('share', contentType, data);
    },
    // Track return visit (user came back)
    returnVisit: (daysSinceLast, data = {}) => {
      track('return_visit', 'engagement', { days_since_last: daysSinceLast, ...data });
      // Update funnel
      updateFunnel('signup_to_value', 'return_visit', {
        stepCompleted: 'return_visit',
        funnelData: { days_since_last: daysSinceLast }
      });
    },
    // Track scroll depth on key pages
    scrollDepth: (page, percentage, data = {}) => {
      track('scroll_depth', 'engagement', { page, percentage, ...data });
    },
    // Track time spent on a section/page
    timeOnSection: (section, durationSeconds, data = {}) => {
      track('time_on_section', 'engagement', { section, duration_seconds: durationSeconds, ...data });
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
    engagement,

    // Utilities
    getSessionId,
    getAnonymousId,
    getDeviceType,
    getBrowserName,
    getUserContext,

    // User context management (call these on auth events)
    updateUserContext,
    clearUserContextCache,

    // Config
    setDebug: (enabled) => { CONFIG.debug = enabled; },
    setEnrichEvents: (enabled) => { CONFIG.enrichEvents = enabled; }
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
