// ===========================================
// ANALYTICS DASHBOARD FUNCTIONS
// ===========================================
// Depends on: config.js (supabaseClient), Chart.js
// Note: isUserAdmin is set by auth state handler in main script

let generationTrendChart = null;
let modelUsageChart = null;

async function loadAnalyticsDashboard() {
  if (!isUserAdmin) return;

  console.log('📊 Loading analytics dashboard...');

  try {
    // Fetch all metrics in parallel
    const [userCount, imageCount, videoCount, todayCount, trendData, modelData] = await Promise.all([
      fetchUserCount(),
      fetchImageCount(),
      fetchVideoCount(),
      fetchTodayGenerations(),
      fetchGenerationTrend(),
      fetchModelUsage()
    ]);

    // Update summary cards
    document.getElementById('analyticsUserCount').textContent = formatNumber(userCount);
    document.getElementById('analyticsImageCount').textContent = formatNumber(imageCount);
    document.getElementById('analyticsVideoCount').textContent = formatNumber(videoCount);
    document.getElementById('analyticsTodayCount').textContent = formatNumber(todayCount);

    // Render charts
    renderGenerationTrendChart(trendData);
    renderModelUsageChart(modelData);

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
