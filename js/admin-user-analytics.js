// ===========================================
// ADMIN USER ANALYTICS DASHBOARD
// ===========================================
// Displays user behavior analytics including funnels, events, and daily activity

(function(window) {
  'use strict';

  // Chart instances for cleanup
  let dailyActivityChart = null;
  let eventCategoryChart = null;

  // ===========================================
  // TAB SWITCHING
  // ===========================================

  window.switchAnalyticsSubtab = function(tab) {
    // Update subtab buttons
    document.querySelectorAll('.analytics-subtab').forEach(btn => {
      btn.classList.remove('active');
    });
    document.getElementById(tab + 'Subtab')?.classList.add('active');

    // Update content visibility
    document.getElementById('platformStatsContent')?.classList.remove('active');
    document.getElementById('platformStatsContent').style.display = 'none';
    document.getElementById('userAnalyticsContent')?.classList.remove('active');
    document.getElementById('userAnalyticsContent').style.display = 'none';

    if (tab === 'platform') {
      document.getElementById('platformStatsContent').classList.add('active');
      document.getElementById('platformStatsContent').style.display = 'block';
    } else if (tab === 'user') {
      document.getElementById('userAnalyticsContent').classList.add('active');
      document.getElementById('userAnalyticsContent').style.display = 'block';
      // Load user analytics when switching to that tab
      loadUserAnalytics();
    }
  };

  // ===========================================
  // LOAD USER ANALYTICS
  // ===========================================

  window.loadUserAnalytics = async function() {
    const days = document.getElementById('userAnalyticsDateRange')?.value || 30;

    try {
      // Load all data in parallel
      const [eventsData, onboardingFunnel, trialFunnel, dailyData] = await Promise.all([
        fetchEventsSummary(days),
        fetchFunnelData('onboarding', days),
        fetchFunnelData('trial', days),
        fetchDailyActivity(days)
      ]);

      // Update summary cards
      updateSummaryCards(eventsData, onboardingFunnel, trialFunnel);

      // Render funnels
      renderFunnel('onboardingFunnel', onboardingFunnel, 'onboarding');
      renderFunnel('trialFunnel', trialFunnel, 'trial');

      // Render charts
      renderDailyActivityChart(dailyData);
      renderEventCategoryChart(eventsData);
      renderTopEventsList(eventsData);

    } catch (error) {
      console.error('Error loading user analytics:', error);
    }
  };

  // ===========================================
  // API CALLS
  // ===========================================

  async function fetchEventsSummary(days) {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/analytics/admin/events/summary?days=${days}`);
      if (!response.ok) throw new Error('Failed to fetch events summary');
      return await response.json();
    } catch (error) {
      console.error('Error fetching events summary:', error);
      return { total_events: 0, unique_users: 0, events_by_category: {}, top_events: [] };
    }
  }

  async function fetchFunnelData(funnelName, days) {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/analytics/admin/funnel/${funnelName}?days=${days}`);
      if (!response.ok) throw new Error('Failed to fetch funnel data');
      return await response.json();
    } catch (error) {
      console.error('Error fetching funnel data:', error);
      return { summary: { total_started: 0, completed: 0, abandoned: 0, in_progress: 0, completion_rate: 0 }, steps_completed: {} };
    }
  }

  async function fetchDailyActivity(days) {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/analytics/admin/daily?days=${days}`);
      if (!response.ok) throw new Error('Failed to fetch daily activity');
      return await response.json();
    } catch (error) {
      console.error('Error fetching daily activity:', error);
      return { daily: [] };
    }
  }

  // ===========================================
  // UPDATE SUMMARY CARDS
  // ===========================================

  function updateSummaryCards(eventsData, onboardingFunnel, trialFunnel) {
    // Total events
    document.getElementById('uaTotalEvents').textContent = formatNumber(eventsData.total_events || 0);

    // Unique users
    document.getElementById('uaUniqueUsers').textContent = formatNumber(eventsData.unique_users || 0);

    // Onboarding completion rate
    const onboardingRate = onboardingFunnel?.summary?.completion_rate || 0;
    document.getElementById('uaOnboardingRate').textContent = onboardingRate + '%';

    // Trial conversion rate
    const trialRate = trialFunnel?.summary?.completion_rate || 0;
    document.getElementById('uaConversionRate').textContent = trialRate + '%';
  }

  // ===========================================
  // RENDER FUNNEL
  // ===========================================

  function renderFunnel(containerId, funnelData, funnelType) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const summary = funnelData?.summary || {};
    const stepsCompleted = funnelData?.steps_completed || {};

    // Define step labels based on funnel type
    const stepConfig = getFunnelStepConfig(funnelType);

    // Calculate max value for scaling
    const totalStarted = summary.total_started || 0;

    if (totalStarted === 0) {
      container.innerHTML = `
        <div class="funnel-loading">
          No data yet. Users will appear here as they progress through the ${funnelType} flow.
        </div>
      `;
      return;
    }

    // Build funnel HTML
    let html = '';

    stepConfig.forEach((step, index) => {
      const count = stepsCompleted[step.key] || 0;
      const percentage = totalStarted > 0 ? Math.round((count / totalStarted) * 100) : 0;
      const barWidth = Math.max(percentage, 10); // Minimum 10% width for visibility

      html += `
        <div class="funnel-step">
          <div class="funnel-step-bar" style="width: ${barWidth}%;">
            <span class="funnel-step-label">${step.label}</span>
          </div>
          <div class="funnel-step-value">
            <strong>${count}</strong> (${percentage}%)
          </div>
        </div>
      `;
    });

    // Add summary
    html += `
      <div class="funnel-summary">
        <div class="funnel-summary-rate">${summary.completion_rate || 0}%</div>
        <div class="funnel-summary-label">Completion Rate</div>
        <div style="margin-top: 8px; font-size: 0.75rem; color: var(--text-secondary);">
          ${summary.completed || 0} completed / ${summary.total_started || 0} started
          ${summary.abandoned > 0 ? ` / ${summary.abandoned} abandoned` : ''}
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  function getFunnelStepConfig(funnelType) {
    if (funnelType === 'onboarding') {
      return [
        { key: 'create_account', label: 'Account' },
        { key: 'choose_character', label: 'Character' },
        { key: 'choose_plan', label: 'Plan' },
        { key: 'choose_education', label: 'Education' },
        { key: 'welcome', label: 'Complete' }
      ];
    } else if (funnelType === 'trial') {
      return [
        { key: 'generation_1', label: 'Try 1' },
        { key: 'generation_2', label: 'Try 2' },
        { key: 'generation_3', label: 'Try 3' }
      ];
    } else if (funnelType === 'checkout') {
      return [
        { key: 'pricing_viewed', label: 'Pricing' },
        { key: 'plan_selected', label: 'Plan' },
        { key: 'checkout_started', label: 'Checkout' },
        { key: 'completed', label: 'Paid' }
      ];
    }
    return [];
  }

  // ===========================================
  // RENDER DAILY ACTIVITY CHART
  // ===========================================

  function renderDailyActivityChart(data) {
    const ctx = document.getElementById('dailyActivityChart')?.getContext('2d');
    if (!ctx) return;

    // Destroy existing chart
    if (dailyActivityChart) {
      dailyActivityChart.destroy();
    }

    const daily = data?.daily || [];

    // Prepare data
    const labels = daily.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const eventsData = daily.map(d => d.events);
    const usersData = daily.map(d => d.unique_users);

    dailyActivityChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Events',
            data: eventsData,
            borderColor: '#9d4edd',
            backgroundColor: 'rgba(157, 78, 221, 0.1)',
            fill: true,
            tension: 0.3
          },
          {
            label: 'Unique Users',
            data: usersData,
            borderColor: '#ff2ebb',
            backgroundColor: 'rgba(255, 46, 187, 0.1)',
            fill: true,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#999' }
          }
        },
        scales: {
          x: {
            ticks: { color: '#666' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#666' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });
  }

  // ===========================================
  // RENDER EVENT CATEGORY CHART
  // ===========================================

  function renderEventCategoryChart(data) {
    const ctx = document.getElementById('eventCategoryChart')?.getContext('2d');
    if (!ctx) return;

    // Destroy existing chart
    if (eventCategoryChart) {
      eventCategoryChart.destroy();
    }

    const categories = data?.events_by_category || {};

    const labels = Object.keys(categories);
    const values = Object.values(categories);

    if (labels.length === 0) {
      ctx.canvas.parentElement.innerHTML = '<div class="funnel-loading">No events recorded yet.</div>';
      return;
    }

    // Colors for categories
    const colors = [
      '#9d4edd', '#ff2ebb', '#00b2ff', '#4ade80',
      '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'
    ];

    eventCategoryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
        datasets: [{
          data: values,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#999',
              padding: 12,
              font: { size: 11 }
            }
          }
        }
      }
    });
  }

  // ===========================================
  // RENDER TOP EVENTS LIST
  // ===========================================

  function renderTopEventsList(data) {
    const container = document.getElementById('topEventsList');
    if (!container) return;

    const topEvents = data?.top_events || [];

    if (topEvents.length === 0) {
      container.innerHTML = '<div class="funnel-loading">No events recorded yet.</div>';
      return;
    }

    const html = topEvents.map(event => `
      <div class="top-event-item">
        <span class="top-event-name">${formatEventName(event.event)}</span>
        <span class="top-event-count">${formatNumber(event.count)}</span>
      </div>
    `).join('');

    container.innerHTML = html;
  }

  // ===========================================
  // UTILITIES
  // ===========================================

  function formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  function formatEventName(eventName) {
    // Convert snake_case to Title Case
    return eventName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

})(window);
