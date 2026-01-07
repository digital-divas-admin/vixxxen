// ===========================================
// ADMIN REPORTS DASHBOARD
// ===========================================
// Depends on: config.js (API_BASE_URL, currentUser), utils.js (escapeHtml)
// Note: isUserAdmin is set by auth state handler in main script

// Load reports for admin dashboard
async function loadAdminReports() {
  if (!isUserAdmin) return;

  const status = document.getElementById('reportStatusFilter')?.value || 'pending';
  const contentType = document.getElementById('reportTypeFilter')?.value || '';

  try {
    // Load stats
    const statsResponse = await fetch(`${API_BASE_URL}/api/reports/stats`);
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      document.getElementById('pendingReportsCount').textContent = stats.by_status?.pending || 0;
      document.getElementById('reviewingReportsCount').textContent = stats.by_status?.reviewing || 0;
      document.getElementById('resolvedReportsCount').textContent = stats.by_status?.resolved || 0;
      document.getElementById('autoHiddenCount').textContent = stats.auto_hidden_pending || 0;
    }

    // Load reports list
    let url = `${API_BASE_URL}/api/reports?is_admin=true&limit=50`;
    if (status) url += `&status=${status}`;
    if (contentType) url += `&content_type=${contentType}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to load reports');

    const data = await response.json();
    renderReportsList(data.reports);

  } catch (error) {
    console.error('Error loading reports:', error);
    document.getElementById('reportsList').innerHTML = `
      <div style="text-align: center; padding: 40px; color: #ff4444;">
        Failed to load reports. Please try again.
      </div>
    `;
  }
}

// Render reports list
function renderReportsList(reports) {
  const container = document.getElementById('reportsList');

  if (!reports || reports.length === 0) {
    container.innerHTML = `
      <div class="reports-empty-state" style="text-align: center; padding: 60px 20px; background: linear-gradient(135deg, rgba(74, 222, 128, 0.05), rgba(74, 222, 128, 0.02)); border: 1px solid rgba(74, 222, 128, 0.15); border-radius: 16px;">
        <div style="font-size: 4rem; margin-bottom: 16px;">✅</div>
        <div style="font-size: 1.3rem; font-weight: 600; color: #4ade80; margin-bottom: 8px;">All Clear!</div>
        <div style="color: #888; font-size: 0.95rem;">No content reports to review at this time.</div>
      </div>
    `;
    return;
  }

  const reasonLabels = {
    illegal_content: '🚨 Illegal Content',
    underage_depiction: '⚠️ Underage Depiction',
    non_consensual: '🚫 Non-consensual',
    harassment: '😠 Harassment',
    hate_speech: '🗣️ Hate Speech',
    impersonation: '🎭 Impersonation',
    spam: '📧 Spam',
    other: '❓ Other'
  };

  const typeIcons = {
    image: '🖼️',
    video: '🎬',
    audio: '🔊',
    chat_message: '💬'
  };

  const statusColors = {
    pending: '#ffa500',
    reviewing: '#00b2ff',
    resolved: '#4ade80',
    dismissed: '#888'
  };

  container.innerHTML = reports.map(report => {
    const date = new Date(report.created_at).toLocaleDateString();
    const time = new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="report-item" style="background: #252525; border-radius: 12px; padding: 20px; border-left: 4px solid ${statusColors[report.status]};">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
          <div>
            <span style="font-size: 1.1rem; margin-right: 8px;">${typeIcons[report.content_type] || '📄'}</span>
            <span style="color: #fff; font-weight: 600;">${reasonLabels[report.reason] || report.reason}</span>
            ${report.auto_hidden ? '<span style="background: #ff4444; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; margin-left: 8px;">AUTO-HIDDEN</span>' : ''}
          </div>
          <span style="color: #888; font-size: 0.85rem;">${date} ${time}</span>
        </div>

        ${report.details ? `<p style="color: #aaa; margin-bottom: 12px; font-size: 0.9rem;">${escapeHtml(report.details)}</p>` : ''}

        ${report.content_url ? `
          <div style="margin-bottom: 12px;">
            ${report.content_type === 'image' ? `<img src="${report.content_url}" style="max-width: 200px; max-height: 150px; border-radius: 8px; cursor: pointer;" onclick="window.open('${report.content_url}', '_blank')">` : ''}
            ${report.content_type === 'video' ? `<video src="${report.content_url}" style="max-width: 200px; max-height: 150px; border-radius: 8px;" controls></video>` : ''}
          </div>
        ` : ''}

        ${report.content_preview ? `<p style="color: #888; font-size: 0.85rem; font-style: italic; margin-bottom: 12px;">"${escapeHtml(report.content_preview)}"</p>` : ''}

        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${report.status === 'pending' ? `
            <button onclick="updateReportStatus('${report.id}', 'reviewing')" style="padding: 8px 16px; background: #00b2ff; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 0.85rem;">Start Review</button>
          ` : ''}
          ${report.status === 'reviewing' ? `
            <button onclick="updateReportStatus('${report.id}', 'resolved', 'content_removed')" style="padding: 8px 16px; background: #ff4444; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 0.85rem;">Remove Content</button>
            <button onclick="updateReportStatus('${report.id}', 'resolved', 'warning')" style="padding: 8px 16px; background: #ffa500; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 0.85rem;">Warn User</button>
            <button onclick="updateReportStatus('${report.id}', 'dismissed', 'none')" style="padding: 8px 16px; background: #666; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 0.85rem;">Dismiss</button>
          ` : ''}
          ${report.status === 'resolved' || report.status === 'dismissed' ? `
            <span style="color: #888; font-size: 0.85rem;">Action: ${report.action_taken || 'None'}</span>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Update report status
async function updateReportStatus(reportId, status, action = null) {
  if (!isUserAdmin || !currentUser) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/reports/${reportId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_user_id: currentUser.id,
        status: status,
        action_taken: action,
        notify_reporter: status === 'resolved' || status === 'dismissed'
      })
    });

    if (!response.ok) throw new Error('Failed to update report');

    const data = await response.json();

    // Show confirmation for content removal
    if (data.content_removed) {
      alert('Content has been removed from the database.');
    }

    // Reload reports
    loadAdminReports();

  } catch (error) {
    console.error('Error updating report:', error);
    alert('Failed to update report. Please try again.');
  }
}
