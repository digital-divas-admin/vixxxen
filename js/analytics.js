// ===========================================
// ANALYTICS DASHBOARD FUNCTIONS
// ===========================================
// Depends on: config.js (supabaseClient), Chart.js
// Note: isUserAdmin is set by auth state handler in main script

let generationTrendChart = null;
let modelUsageChart = null;
let serverlessHourlyChart = null;

async function loadAnalyticsDashboard() {
  if (!isUserAdmin) return;

  console.log('📊 Loading analytics dashboard...');

  try {
    // Fetch all metrics in parallel
    const [userCount, imageCount, videoCount, todayCount, trendData, modelData, serverlessHourly, serverlessHeatmap] = await Promise.all([
      fetchUserCount(),
      fetchImageCount(),
      fetchVideoCount(),
      fetchTodayGenerations(),
      fetchGenerationTrend(),
      fetchModelUsage(),
      fetchServerlessHourlyUsage(),
      fetchServerlessHeatmapData()
    ]);

    // Update summary cards
    document.getElementById('analyticsUserCount').textContent = formatNumber(userCount);
    document.getElementById('analyticsImageCount').textContent = formatNumber(imageCount);
    document.getElementById('analyticsVideoCount').textContent = formatNumber(videoCount);
    document.getElementById('analyticsTodayCount').textContent = formatNumber(todayCount);

    // Render charts
    renderGenerationTrendChart(trendData);
    renderModelUsageChart(modelData);
    renderServerlessHourlyChart(serverlessHourly);
    renderServerlessHeatmap(serverlessHeatmap);

    console.log('📊 Analytics dashboard loaded successfully');
  } catch (error) {
    console.error('Error loading analytics:', error);
  }
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

async function fetchUserCount() {
  try {
    const { count, error } = await supabaseClient
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  } catch (e) {
    console.error('Error fetching user count:', e);
    return 0;
  }
}

async function fetchImageCount() {
  try {
    const { count, error } = await supabaseClient
      .from('generated_images')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  } catch (e) {
    console.error('Error fetching image count:', e);
    return 0;
  }
}

async function fetchVideoCount() {
  try {
    const { count, error } = await supabaseClient
      .from('generated_videos')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  } catch (e) {
    console.error('Error fetching video count:', e);
    return 0;
  }
}

async function fetchTodayGenerations() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const [imageResult, videoResult] = await Promise.all([
      supabaseClient
        .from('generated_images')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayIso),
      supabaseClient
        .from('generated_videos')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayIso)
    ]);

    return (imageResult.count || 0) + (videoResult.count || 0);
  } catch (e) {
    console.error('Error fetching today count:', e);
    return 0;
  }
}

async function fetchGenerationTrend() {
  try {
    // Get data for last 7 days
    const days = [];
    const imageCounts = [];
    const videoCounts = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const startOfDay = date.toISOString();

      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      const endOfDay = endDate.toISOString();

      days.push(date.toLocaleDateString('en-US', { weekday: 'short' }));

      const [imageResult, videoResult] = await Promise.all([
        supabaseClient
          .from('generated_images')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startOfDay)
          .lt('created_at', endOfDay),
        supabaseClient
          .from('generated_videos')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startOfDay)
          .lt('created_at', endOfDay)
      ]);

      imageCounts.push(imageResult.count || 0);
      videoCounts.push(videoResult.count || 0);
    }

    return { days, imageCounts, videoCounts };
  } catch (e) {
    console.error('Error fetching trend data:', e);
    return { days: [], imageCounts: [], videoCounts: [] };
  }
}

async function fetchModelUsage() {
  try {
    // Fetch image models
    const { data: imageData, error: imageError } = await supabaseClient
      .from('generated_images')
      .select('model');

    if (imageError) throw imageError;

    // Count by model
    const modelCounts = {};
    (imageData || []).forEach(item => {
      const model = item.model || 'Unknown';
      modelCounts[model] = (modelCounts[model] || 0) + 1;
    });

    // Convert to arrays for chart
    const labels = Object.keys(modelCounts);
    const values = Object.values(modelCounts);

    return { labels, values };
  } catch (e) {
    console.error('Error fetching model usage:', e);
    return { labels: [], values: [] };
  }
}

function renderGenerationTrendChart(data) {
  const ctx = document.getElementById('generationTrendChart');
  if (!ctx) return;

  // Destroy existing chart if it exists
  if (generationTrendChart) {
    generationTrendChart.destroy();
  }

  generationTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.days,
      datasets: [
        {
          label: 'Images',
          data: data.imageCounts,
          borderColor: '#9d4edd',
          backgroundColor: 'rgba(157, 78, 221, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: 'Videos',
          data: data.videoCounts,
          borderColor: '#ff2ebb',
          backgroundColor: 'rgba(255, 46, 187, 0.1)',
          fill: true,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#888' }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.1)' },
          ticks: { color: '#888' }
        },
        x: {
          grid: { color: 'rgba(255,255,255,0.1)' },
          ticks: { color: '#888' }
        }
      }
    }
  });
}

function renderModelUsageChart(data) {
  const ctx = document.getElementById('modelUsageChart');
  if (!ctx) return;

  // Destroy existing chart if it exists
  if (modelUsageChart) {
    modelUsageChart.destroy();
  }

  // Color palette
  const colors = [
    '#9d4edd', '#ff2ebb', '#00b2ff', '#4ade80', '#ffa500',
    '#ff6b6b', '#a855f7', '#06b6d4', '#eab308', '#ec4899'
  ];

  modelUsageChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.labels,
      datasets: [{
        data: data.values,
        backgroundColor: colors.slice(0, data.labels.length),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#888',
            boxWidth: 12,
            padding: 8
          }
        }
      }
    }
  });
}

// ===========================================
// SERVERLESS GPU USAGE ANALYTICS (Qwen + Inpaint)
// ===========================================

// Convert UTC date to Mountain Time hour (0-23)
function toMountainHour(utcDate) {
  const date = new Date(utcDate);
  // Get hour in Mountain Time
  const mtHour = parseInt(date.toLocaleString('en-US', {
    timeZone: 'America/Denver',
    hour: 'numeric',
    hour12: false
  }));
  return mtHour;
}

// Convert UTC date to Mountain Time day of week (0=Sun, 6=Sat)
function toMountainDayOfWeek(utcDate) {
  const date = new Date(utcDate);
  const mtDay = date.toLocaleString('en-US', {
    timeZone: 'America/Denver',
    weekday: 'short'
  });
  const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  return dayMap[mtDay];
}

// Fetch serverless generations (qwen + inpaint) for last 7 days
async function fetchServerlessHourlyUsage() {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDate = sevenDaysAgo.toISOString();

    // Fetch all qwen and inpaint generations
    const { data, error } = await supabaseClient
      .from('generated_images')
      .select('created_at, model')
      .or('model.ilike.%qwen%,model.ilike.%inpaint%')
      .gte('created_at', startDate);

    if (error) throw error;

    // Group by hour (Mountain Time)
    const hourCounts = new Array(24).fill(0);
    (data || []).forEach(item => {
      const hour = toMountainHour(item.created_at);
      hourCounts[hour]++;
    });

    return hourCounts;
  } catch (e) {
    console.error('Error fetching serverless hourly usage:', e);
    return new Array(24).fill(0);
  }
}

// Fetch serverless generations grouped by day and hour for heatmap
async function fetchServerlessHeatmapData() {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDate = sevenDaysAgo.toISOString();

    // Fetch all qwen and inpaint generations
    const { data, error } = await supabaseClient
      .from('generated_images')
      .select('created_at, model')
      .or('model.ilike.%qwen%,model.ilike.%inpaint%')
      .gte('created_at', startDate);

    if (error) throw error;

    // Create 7x24 grid (days x hours)
    // We'll track actual dates and map them to positions
    const heatmapData = {};

    // Initialize grid for each of the last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayKey = date.toLocaleDateString('en-US', {
        timeZone: 'America/Denver',
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
      heatmapData[dayKey] = new Array(24).fill(0);
    }

    // Count generations per day/hour
    (data || []).forEach(item => {
      const date = new Date(item.created_at);
      const dayKey = date.toLocaleDateString('en-US', {
        timeZone: 'America/Denver',
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
      const hour = toMountainHour(item.created_at);

      if (heatmapData[dayKey]) {
        heatmapData[dayKey][hour]++;
      }
    });

    return heatmapData;
  } catch (e) {
    console.error('Error fetching serverless heatmap data:', e);
    return {};
  }
}

// Render hourly bar chart
function renderServerlessHourlyChart(hourCounts) {
  const ctx = document.getElementById('serverlessHourlyChart');
  if (!ctx) return;

  // Destroy existing chart if it exists
  if (serverlessHourlyChart) {
    serverlessHourlyChart.destroy();
  }

  // Generate hour labels (12am, 1am, ..., 11pm)
  const labels = [];
  for (let i = 0; i < 24; i++) {
    if (i === 0) labels.push('12am');
    else if (i < 12) labels.push(i + 'am');
    else if (i === 12) labels.push('12pm');
    else labels.push((i - 12) + 'pm');
  }

  // Find max value for gradient coloring
  const maxVal = Math.max(...hourCounts, 1);
  const backgroundColors = hourCounts.map(val => {
    const intensity = val / maxVal;
    if (intensity < 0.2) return 'rgba(157, 78, 221, 0.3)';
    if (intensity < 0.4) return 'rgba(157, 78, 221, 0.5)';
    if (intensity < 0.6) return 'rgba(157, 78, 221, 0.7)';
    if (intensity < 0.8) return 'rgba(255, 46, 187, 0.7)';
    return 'rgba(255, 46, 187, 0.9)';
  });

  serverlessHourlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Generations',
        data: hourCounts,
        backgroundColor: backgroundColors,
        borderColor: 'rgba(157, 78, 221, 0.8)',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0].label + ' (Mountain Time)',
            label: (item) => `${item.raw} generation${item.raw !== 1 ? 's' : ''}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.1)' },
          ticks: {
            color: '#888',
            stepSize: 1,
            precision: 0
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            color: '#888',
            maxRotation: 45,
            minRotation: 45,
            font: { size: 10 }
          }
        }
      }
    }
  });
}

// Render heatmap
function renderServerlessHeatmap(heatmapData) {
  const container = document.getElementById('serverlessHeatmap');
  if (!container) return;

  const days = Object.keys(heatmapData);
  if (days.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">No data available</p>';
    return;
  }

  // Find max value for intensity scaling
  let maxVal = 1;
  days.forEach(day => {
    maxVal = Math.max(maxVal, ...heatmapData[day]);
  });

  // Build HTML
  let html = '';

  // Header row with hours
  html += '<div class="heatmap-header"></div>'; // Empty corner cell
  for (let h = 0; h < 24; h++) {
    let label;
    if (h === 0) label = '12a';
    else if (h < 12) label = h + 'a';
    else if (h === 12) label = '12p';
    else label = (h - 12) + 'p';
    html += `<div class="heatmap-header">${label}</div>`;
  }

  // Data rows (one per day)
  days.forEach(dayLabel => {
    // Day label
    html += `<div class="heatmap-day-label">${dayLabel.split(',')[0]}</div>`;

    // Hour cells
    for (let h = 0; h < 24; h++) {
      const count = heatmapData[dayLabel][h];
      const level = getHeatmapLevel(count, maxVal);
      html += `<div class="heatmap-cell" data-level="${level}" data-day="${dayLabel}" data-hour="${h}" data-count="${count}"></div>`;
    }
  });

  container.innerHTML = html;

  // Add tooltip event listeners
  setupHeatmapTooltips();
}

// Calculate heatmap intensity level (0-5)
function getHeatmapLevel(count, maxVal) {
  if (count === 0) return 0;
  const ratio = count / maxVal;
  if (ratio <= 0.2) return 1;
  if (ratio <= 0.4) return 2;
  if (ratio <= 0.6) return 3;
  if (ratio <= 0.8) return 4;
  return 5;
}

// Setup heatmap tooltip interactions
function setupHeatmapTooltips() {
  const tooltip = document.getElementById('heatmapTooltip');
  const cells = document.querySelectorAll('.heatmap-cell');

  cells.forEach(cell => {
    cell.addEventListener('mouseenter', (e) => {
      const day = cell.dataset.day;
      const hour = parseInt(cell.dataset.hour);
      const count = cell.dataset.count;

      let hourLabel;
      if (hour === 0) hourLabel = '12:00 AM';
      else if (hour < 12) hourLabel = hour + ':00 AM';
      else if (hour === 12) hourLabel = '12:00 PM';
      else hourLabel = (hour - 12) + ':00 PM';

      tooltip.innerHTML = `<strong>${day}</strong><br>${hourLabel} MT<br>${count} generation${count !== '1' ? 's' : ''}`;
      tooltip.style.display = 'block';
    });

    cell.addEventListener('mousemove', (e) => {
      tooltip.style.left = (e.clientX + 10) + 'px';
      tooltip.style.top = (e.clientY + 10) + 'px';
    });

    cell.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });
}
