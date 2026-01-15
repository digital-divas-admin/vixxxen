// ===========================================
// ADMIN USER ANALYTICS DASHBOARD
// ===========================================
// Displays user behavior analytics including funnels, events, and daily activity

(function(window) {
  'use strict';

  // Chart instances for cleanup
  let dailyActivityChart = null;
  let eventCategoryChart = null;
  let sessionDurationChart = null;

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
      const [eventsData, onboardingFunnel, trialFunnel, signupToValueFunnel, dailyData, sessionsData, retentionData] = await Promise.all([
        fetchEventsSummary(days),
        fetchFunnelData('onboarding', days),
        fetchFunnelData('trial', days),
        fetchFunnelData('signup_to_value', days),
        fetchDailyActivity(days),
        fetchSessionsData(days),
        fetchRetentionData(8)
      ]);

      // Update summary cards
      updateSummaryCards(eventsData, onboardingFunnel, trialFunnel, sessionsData);

      // Render funnels
      renderFunnel('onboardingFunnel', onboardingFunnel, 'onboarding');
      renderFunnel('trialFunnel', trialFunnel, 'trial');
      renderFunnel('signupToValueFunnel', signupToValueFunnel, 'signup_to_value');

      // Render charts
      renderDailyActivityChart(dailyData);
      renderEventCategoryChart(eventsData);
      renderTopEventsList(eventsData);

      // Render Phase 5 features
      renderSessionStats(sessionsData);
      renderRetentionTable(retentionData);

      // Render Phase 1/2 features (new)
      renderFirstGenMetrics(eventsData);
      renderDeviceBreakdown(eventsData);

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

  async function fetchSessionsData(days) {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/analytics/admin/sessions?days=${days}`);
      if (!response.ok) throw new Error('Failed to fetch sessions data');
      return await response.json();
    } catch (error) {
      console.error('Error fetching sessions data:', error);
      return { total_sessions: 0, avg_duration_seconds: 0, duration_distribution: {} };
    }
  }

  async function fetchRetentionData(weeks) {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/analytics/admin/retention?weeks=${weeks}`);
      if (!response.ok) throw new Error('Failed to fetch retention data');
      return await response.json();
    } catch (error) {
      console.error('Error fetching retention data:', error);
      return { cohorts: [], overall: {} };
    }
  }

  // ===========================================
  // UPDATE SUMMARY CARDS
  // ===========================================

  function updateSummaryCards(eventsData, onboardingFunnel, trialFunnel, sessionsData) {
    // Total events
    document.getElementById('uaTotalEvents').textContent = formatNumber(eventsData.total_events || 0);

    // Unique users
    document.getElementById('uaUniqueUsers').textContent = formatNumber(eventsData.unique_users || 0);

    // Onboarding completion rate
    const onboardingRate = onboardingFunnel?.summary?.completion_rate || 0;
    document.getElementById('uaOnboardingRate').textContent = onboardingRate + '%';

    // Avg session duration (replacing trial conversion)
    const avgDuration = sessionsData?.avg_duration_seconds || 0;
    const avgDurationEl = document.getElementById('uaConversionRate');
    if (avgDurationEl) {
      avgDurationEl.textContent = formatDuration(avgDuration);
      // Update the label if we have access
      const labelEl = avgDurationEl.closest('.ua-summary-card')?.querySelector('.ua-summary-label');
      if (labelEl) labelEl.textContent = 'Avg Session';
    }
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
    } else if (funnelType === 'signup_to_value') {
      return [
        { key: 'first_generation_attempted', label: '1st Gen Attempt' },
        { key: 'first_generation_success', label: '1st Gen Success' },
        { key: 'value_moment_reached', label: 'Value Moment' },
        { key: 'return_visit', label: 'Return Visit' }
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

  function formatDuration(seconds) {
    if (!seconds || seconds === 0) return '0s';
    if (seconds < 60) return Math.round(seconds) + 's';
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  // ===========================================
  // RENDER SESSION STATS
  // ===========================================

  function renderSessionStats(data) {
    const container = document.getElementById('sessionStatsContainer');
    if (!container) return;

    if (!data || data.total_sessions === 0) {
      container.innerHTML = '<div class="funnel-loading">No session data yet. Sessions will appear once users start browsing.</div>';
      return;
    }

    const distribution = data.duration_distribution || {};

    let html = `
      <div class="session-stats-grid">
        <div class="session-stat-item">
          <div class="session-stat-value">${formatNumber(data.total_sessions)}</div>
          <div class="session-stat-label">Total Sessions</div>
        </div>
        <div class="session-stat-item">
          <div class="session-stat-value">${formatDuration(data.avg_duration_seconds)}</div>
          <div class="session-stat-label">Avg Duration</div>
        </div>
        <div class="session-stat-item">
          <div class="session-stat-value">${formatDuration(data.median_duration_seconds)}</div>
          <div class="session-stat-label">Median Duration</div>
        </div>
        <div class="session-stat-item">
          <div class="session-stat-value">${data.avg_page_views || 0}</div>
          <div class="session-stat-label">Avg Page Views</div>
        </div>
      </div>
      <div class="session-duration-distribution">
        <h4 style="margin: 16px 0 8px; font-size: 0.875rem; color: var(--text-secondary);">Duration Distribution</h4>
        <div class="duration-bars">
    `;

    const maxCount = Math.max(...Object.values(distribution), 1);
    const bucketLabels = {
      '0-30s': 'Bounce',
      '30s-2m': 'Quick',
      '2m-5m': 'Short',
      '5m-15m': 'Medium',
      '15m-30m': 'Long',
      '30m+': 'Extended'
    };

    Object.entries(distribution).forEach(([bucket, count]) => {
      const width = Math.max((count / maxCount) * 100, 5);
      html += `
        <div class="duration-bar-row">
          <span class="duration-bar-label">${bucketLabels[bucket] || bucket}</span>
          <div class="duration-bar-container">
            <div class="duration-bar" style="width: ${width}%;"></div>
          </div>
          <span class="duration-bar-count">${count}</span>
        </div>
      `;
    });

    html += '</div></div>';
    container.innerHTML = html;
  }

  // ===========================================
  // RENDER RETENTION TABLE
  // ===========================================

  function renderRetentionTable(data) {
    const container = document.getElementById('retentionTableContainer');
    if (!container) return;

    if (!data || !data.cohorts || data.cohorts.length === 0) {
      container.innerHTML = '<div class="funnel-loading">No retention data yet. Data will appear as users return to the platform.</div>';
      return;
    }

    let html = `
      <div class="retention-summary" style="margin-bottom: 16px; display: flex; gap: 16px; flex-wrap: wrap;">
        <div class="retention-summary-item">
          <span class="retention-label">Day 1:</span>
          <span class="retention-value">${data.overall.day_1_retention || 0}%</span>
        </div>
        <div class="retention-summary-item">
          <span class="retention-label">Day 7:</span>
          <span class="retention-value">${data.overall.day_7_retention || 0}%</span>
        </div>
        <div class="retention-summary-item">
          <span class="retention-label">Day 14:</span>
          <span class="retention-value">${data.overall.day_14_retention || 0}%</span>
        </div>
        <div class="retention-summary-item">
          <span class="retention-label">Day 30:</span>
          <span class="retention-value">${data.overall.day_30_retention || 0}%</span>
        </div>
      </div>
      <div class="retention-table-wrapper">
        <table class="retention-table">
          <thead>
            <tr>
              <th>Cohort</th>
              <th>Users</th>
              <th>Day 1</th>
              <th>Day 7</th>
              <th>Day 14</th>
              <th>Day 30</th>
            </tr>
          </thead>
          <tbody>
    `;

    data.cohorts.slice(0, 8).forEach(cohort => {
      html += `
        <tr>
          <td>${formatCohortDate(cohort.week_start)}</td>
          <td>${cohort.total_users}</td>
          <td class="${getRetentionClass(cohort.day_1_pct)}">${cohort.day_1_pct}%</td>
          <td class="${getRetentionClass(cohort.day_7_pct)}">${cohort.day_7_pct}%</td>
          <td class="${getRetentionClass(cohort.day_14_pct)}">${cohort.day_14_pct}%</td>
          <td class="${getRetentionClass(cohort.day_30_pct)}">${cohort.day_30_pct}%</td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  function formatCohortDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function getRetentionClass(pct) {
    const val = parseFloat(pct) || 0;
    if (val >= 50) return 'retention-high';
    if (val >= 25) return 'retention-medium';
    return 'retention-low';
  }

  // ===========================================
  // RENDER FIRST GENERATION METRICS
  // ===========================================

  function renderFirstGenMetrics(eventsData) {
    const container = document.getElementById('firstGenMetricsContainer');
    if (!container) return;

    const topEvents = eventsData?.top_events || [];

    // Find first gen events
    const firstAttempted = topEvents.find(e => e.event === 'first_generation_attempted')?.count || 0;
    const firstSuccess = topEvents.find(e => e.event === 'first_generation_success')?.count || 0;
    const firstFailure = topEvents.find(e => e.event === 'first_generation_failure')?.count || 0;
    const valueMoment = topEvents.find(e => e.event === 'value_moment_reached')?.count || 0;

    const successRate = firstAttempted > 0 ? Math.round((firstSuccess / firstAttempted) * 100) : 0;
    const valueRate = firstSuccess > 0 ? Math.round((valueMoment / firstSuccess) * 100) : 0;

    const html = `
      <div class="first-gen-metrics-grid">
        <div class="first-gen-metric">
          <div class="first-gen-value">${formatNumber(firstAttempted)}</div>
          <div class="first-gen-label">First Attempts</div>
        </div>
        <div class="first-gen-metric">
          <div class="first-gen-value">${formatNumber(firstSuccess)}</div>
          <div class="first-gen-label">First Success</div>
        </div>
        <div class="first-gen-metric">
          <div class="first-gen-value">${successRate}%</div>
          <div class="first-gen-label">Success Rate</div>
        </div>
        <div class="first-gen-metric">
          <div class="first-gen-value">${formatNumber(valueMoment)}</div>
          <div class="first-gen-label">Value Moments</div>
        </div>
        <div class="first-gen-metric">
          <div class="first-gen-value">${valueRate}%</div>
          <div class="first-gen-label">Value Rate</div>
        </div>
      </div>
      ${firstFailure > 0 ? `<div style="margin-top: 8px; font-size: 0.75rem; color: var(--text-secondary);">${firstFailure} users failed on first attempt</div>` : ''}
    `;

    container.innerHTML = html;
  }

  // ===========================================
  // RENDER DEVICE BREAKDOWN
  // ===========================================

  function renderDeviceBreakdown(eventsData) {
    const container = document.getElementById('deviceBreakdownContainer');
    if (!container) return;

    // Device breakdown from events_by_category won't have this data
    // We'd need a separate endpoint for device breakdown
    // For now, show placeholder
    const html = `
      <div class="device-breakdown-note" style="color: var(--text-secondary); font-size: 0.875rem; padding: 16px; text-align: center;">
        Device data is being collected. Check back after more events are tracked.
      </div>
    `;

    container.innerHTML = html;
  }

})(window);
