// ===========================================
// REPORTING SYSTEM
// ===========================================
// Depends on: config.js (currentUser, API_BASE_URL)

// Open report modal for content
function openReportModal(contentType, contentId, contentUrl = null, contentPreview = null, reportedUserId = null) {
  if (!currentUser) {
    alert('Please log in to report content');
    return;
  }

  document.getElementById('reportContentType').value = contentType;
  document.getElementById('reportContentId').value = contentId || '';
  document.getElementById('reportContentUrl').value = contentUrl || '';
  document.getElementById('reportContentPreview').value = contentPreview || '';
  document.getElementById('reportedUserId').value = reportedUserId || '';

  // Reset form
  document.getElementById('reportForm').reset();
  document.getElementById('reportSubmitBtn').disabled = false;
  document.getElementById('reportSubmitBtn').textContent = 'Submit Report';

  document.getElementById('reportModal').classList.add('active');
}

// Close report modal
function closeReportModal() {
  document.getElementById('reportModal').classList.remove('active');
}

// Submit report
async function submitReport(event) {
  event.preventDefault();

  const submitBtn = document.getElementById('reportSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  const reportData = {
    reporter_user_id: currentUser?.id || null,
    anonymous: document.getElementById('reportAnonymous').checked,
    content_type: document.getElementById('reportContentType').value,
    content_id: document.getElementById('reportContentId').value || null,
    content_url: document.getElementById('reportContentUrl').value || null,
    content_preview: document.getElementById('reportContentPreview').value || null,
    reported_user_id: document.getElementById('reportedUserId').value || null,
    reason: document.getElementById('reportReason').value,
    details: document.getElementById('reportDetails').value || null
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportData)
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 429) {
        alert('Rate limit exceeded. Please wait before submitting more reports.');
      } else if (response.status === 409) {
        alert('You have already reported this content.');
      } else {
        throw new Error(data.error || 'Failed to submit report');
      }
      return;
    }

    alert('Thank you for your report. Our team will review it.');
    closeReportModal();

  } catch (error) {
    console.error('Error submitting report:', error);
    alert('Error submitting report. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Report';
  }
}

// Report button for generated content
function getReportButton(contentType, contentId, contentUrl = null, reportedUserId = null) {
  return `
    <button class="report-btn" onclick="event.stopPropagation(); openReportModal('${contentType}', '${contentId}', '${contentUrl || ''}', '', '${reportedUserId || ''}')" title="Report content">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
        <line x1="4" y1="22" x2="4" y2="15"></line>
      </svg>
    </button>
  `;
}
