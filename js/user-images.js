// ===========================================
// USER IMAGE LIBRARY PAGE FUNCTIONS
// ===========================================
// Depends on: config.js (currentUser, supabaseClient, API_BASE_URL)

// Current filter state
let imageLibraryFilter = 'all';
let imageLibraryImages = [];

// Open image library page
function openImageLibraryPage() {
  // Close user menu if open
  const userMenu = document.getElementById('userMenu');
  if (userMenu) userMenu.classList.remove('active');

  // Hide all tab sections
  document.querySelectorAll('.tab-section').forEach(section => {
    section.classList.remove('active');
  });

  // Deactivate all nav tabs
  document.querySelectorAll('.nav-tab').forEach(navTab => {
    navTab.classList.remove('active');
  });

  // Show image library page
  document.getElementById('imageLibrarySection').classList.add('active');

  // Load images
  loadImageLibrary();

  console.log('Opened image library page');
}

// Load image library
async function loadImageLibrary() {
  if (!currentUser) {
    showImageLibraryMessage('Please log in to view your image library', 'warning');
    return;
  }

  const grid = document.getElementById('imageLibraryGrid');
  const stats = document.getElementById('imageLibraryStats');

  // Show loading state
  grid.innerHTML = `
    <div class="image-library-loading">
      <div class="loading-spinner"></div>
      <p>Loading your images...</p>
    </div>
  `;

  try {
    // Get auth token
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      showImageLibraryMessage('Please log in to view your image library', 'warning');
      return;
    }

    // Fetch images from API
    const response = await fetch(`${API_BASE_URL}/api/user-images/list?status=${imageLibraryFilter}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to load images: ${response.status}`);
    }

    const data = await response.json();
    imageLibraryImages = data.images || [];

    // Update stats
    updateImageLibraryStats(data.counts || {});

    // Render images
    renderImageLibraryGrid();

  } catch (error) {
    console.error('Failed to load image library:', error);
    grid.innerHTML = `
      <div class="image-library-error">
        <p>Failed to load images: ${error.message}</p>
        <button class="account-btn secondary" onclick="loadImageLibrary()">Retry</button>
      </div>
    `;
  }
}

// Update stats display
function updateImageLibraryStats(counts) {
  const stats = document.getElementById('imageLibraryStats');
  if (!stats) return;

  const total = (counts.auto_approved || 0) + (counts.approved || 0) + (counts.pending_review || 0) + (counts.rejected || 0);
  const approved = (counts.auto_approved || 0) + (counts.approved || 0);
  const pending = counts.pending_review || 0;
  const rejected = counts.rejected || 0;

  stats.innerHTML = `
    <div class="library-stat">
      <span class="stat-number">${total}</span>
      <span class="stat-label">Total</span>
    </div>
    <div class="library-stat approved">
      <span class="stat-number">${approved}</span>
      <span class="stat-label">Approved</span>
    </div>
    <div class="library-stat pending">
      <span class="stat-number">${pending}</span>
      <span class="stat-label">Pending</span>
    </div>
    <div class="library-stat rejected">
      <span class="stat-number">${rejected}</span>
      <span class="stat-label">Rejected</span>
    </div>
  `;
}

// Filter images
function filterImageLibrary(status) {
  imageLibraryFilter = status;

  // Update active filter button
  document.querySelectorAll('.library-filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-filter="${status}"]`)?.classList.add('active');

  // Reload images
  loadImageLibrary();
}

// Render image grid
function renderImageLibraryGrid() {
  const grid = document.getElementById('imageLibraryGrid');

  if (imageLibraryImages.length === 0) {
    grid.innerHTML = `
      <div class="image-library-empty">
        <p>No images found${imageLibraryFilter !== 'all' ? ` with status "${imageLibraryFilter}"` : ''}.</p>
        <p class="empty-hint">Images that are flagged during generation will appear here for review.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = imageLibraryImages.map(img => {
    const statusClass = getStatusClass(img.status);
    const statusLabel = getStatusLabel(img.status);
    const canAppeal = img.status === 'pending_review' && !img.appeal_submitted_at;
    const appealPending = img.status === 'pending_review' && img.appeal_submitted_at;

    return `
      <div class="library-image-card ${statusClass}" data-image-id="${img.id}">
        <div class="library-image-wrapper">
          <img src="${img.thumbnail_url || img.url}" alt="Library image" loading="lazy" onclick="viewLibraryImage('${img.id}')">
          <div class="library-image-status ${statusClass}">${statusLabel}</div>
        </div>
        <div class="library-image-info">
          <div class="library-image-date">${formatDate(img.created_at)}</div>
          ${img.moderation_flags?.reasons?.length > 0 ? `
            <div class="library-image-reason">${img.moderation_flags.reasons[0]}</div>
          ` : ''}
          <div class="library-image-actions">
            ${canAppeal ? `
              <button class="library-btn appeal" onclick="openAppealModal('${img.id}')">Appeal</button>
            ` : ''}
            ${appealPending ? `
              <span class="appeal-pending-badge">Appeal Pending</span>
            ` : ''}
            ${img.status === 'auto_approved' || img.status === 'approved' ? `
              <button class="library-btn use" onclick="copyImageId('${img.id}')">Copy ID</button>
            ` : ''}
            <button class="library-btn delete" onclick="deleteLibraryImage('${img.id}')">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Status helpers
function getStatusClass(status) {
  switch (status) {
    case 'auto_approved':
    case 'approved':
      return 'status-approved';
    case 'pending_review':
      return 'status-pending';
    case 'rejected':
      return 'status-rejected';
    default:
      return '';
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'auto_approved':
      return 'Auto-Approved';
    case 'approved':
      return 'Approved';
    case 'pending_review':
      return 'Pending Review';
    case 'rejected':
      return 'Rejected';
    default:
      return status;
  }
}

// Format date
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// View full image
async function viewLibraryImage(imageId) {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    const response = await fetch(`${API_BASE_URL}/api/user-images/${imageId}/data`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!response.ok) throw new Error('Failed to load image');

    const data = await response.json();

    // Open in lightbox or new tab
    if (data.dataUrl) {
      const win = window.open();
      win.document.write(`<img src="${data.dataUrl}" style="max-width: 100%; max-height: 100vh;">`);
    }
  } catch (error) {
    console.error('Failed to view image:', error);
    alert('Failed to load full image');
  }
}

// Copy image ID to clipboard
function copyImageId(imageId) {
  navigator.clipboard.writeText(imageId).then(() => {
    // Show toast notification
    showToast('Image ID copied! You can use this ID in generation.');
  }).catch(() => {
    // Fallback
    prompt('Copy this image ID:', imageId);
  });
}

// Open appeal modal
function openAppealModal(imageId) {
  const modal = document.getElementById('appealModal');
  const imageIdInput = document.getElementById('appealImageId');
  const reasonInput = document.getElementById('appealReason');

  if (imageIdInput) imageIdInput.value = imageId;
  if (reasonInput) reasonInput.value = '';

  modal.classList.add('active');
}

// Close appeal modal
function closeAppealModal() {
  document.getElementById('appealModal').classList.remove('active');
}

// Submit appeal
async function submitAppeal() {
  const imageId = document.getElementById('appealImageId').value;
  const reason = document.getElementById('appealReason').value.trim();

  if (!reason) {
    alert('Please provide a reason for your appeal');
    return;
  }

  const submitBtn = document.querySelector('#appealModal .account-btn.primary');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE_URL}/api/user-images/${imageId}/appeal`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to submit appeal');
    }

    closeAppealModal();
    showToast('Appeal submitted successfully. We will review your image soon.');
    loadImageLibrary();

  } catch (error) {
    console.error('Appeal failed:', error);
    alert(`Failed to submit appeal: ${error.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

// Delete library image
async function deleteLibraryImage(imageId) {
  if (!confirm('Are you sure you want to delete this image from your library?')) {
    return;
  }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE_URL}/api/user-images/${imageId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete image');
    }

    showToast('Image deleted');
    loadImageLibrary();

  } catch (error) {
    console.error('Delete failed:', error);
    alert(`Failed to delete image: ${error.message}`);
  }
}

// Show message in library grid
function showImageLibraryMessage(message, type = 'info') {
  const grid = document.getElementById('imageLibraryGrid');
  grid.innerHTML = `
    <div class="image-library-message ${type}">
      <p>${message}</p>
    </div>
  `;
}

// Simple toast notification
function showToast(message) {
  // Check if toast container exists, if not create it
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.style.cssText = `
    background: #333;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    margin-top: 10px;
    animation: slideIn 0.3s ease;
  `;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Go back from image library
function goBackFromImageLibrary() {
  document.getElementById('imageLibrarySection').classList.remove('active');
  document.getElementById('imageSection').classList.add('active');
  document.querySelector('[data-tab="image"]')?.classList.add('active');
}

// ===========================================
// ADMIN IMAGE REVIEW FUNCTIONS
// ===========================================

let adminReviewQueue = [];
let adminReviewFilter = 'pending_review';

// Open admin review page (for admins only)
function openAdminImageReviewPage() {
  // Hide all tab sections
  document.querySelectorAll('.tab-section').forEach(section => {
    section.classList.remove('active');
  });

  // Deactivate all nav tabs
  document.querySelectorAll('.nav-tab').forEach(navTab => {
    navTab.classList.remove('active');
  });

  // Show admin review page
  document.getElementById('adminImageReviewSection').classList.add('active');

  // Load review queue
  loadAdminReviewQueue();
}

// Load admin review queue
async function loadAdminReviewQueue() {
  const grid = document.getElementById('adminReviewGrid');
  const stats = document.getElementById('adminReviewStats');

  grid.innerHTML = `
    <div class="image-library-loading">
      <div class="loading-spinner"></div>
      <p>Loading review queue...</p>
    </div>
  `;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      grid.innerHTML = '<p>Please log in as admin</p>';
      return;
    }

    // Fetch review queue
    const response = await fetch(`${API_BASE_URL}/api/user-images/admin/queue?status=${adminReviewFilter}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!response.ok) {
      if (response.status === 403) {
        grid.innerHTML = '<p>Admin access required</p>';
        return;
      }
      throw new Error(`Failed to load queue: ${response.status}`);
    }

    const data = await response.json();
    adminReviewQueue = data.images || [];

    // Update stats
    if (stats) {
      stats.innerHTML = `
        <div class="library-stat pending">
          <span class="stat-number">${data.total || 0}</span>
          <span class="stat-label">Pending Review</span>
        </div>
      `;
    }

    // Render queue
    renderAdminReviewGrid();

  } catch (error) {
    console.error('Failed to load review queue:', error);
    grid.innerHTML = `<p>Error: ${error.message}</p>`;
  }
}

// Render admin review grid
function renderAdminReviewGrid() {
  const grid = document.getElementById('adminReviewGrid');

  if (adminReviewQueue.length === 0) {
    grid.innerHTML = `
      <div class="image-library-empty">
        <p>No images pending review.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = adminReviewQueue.map(img => `
    <div class="admin-review-card" data-image-id="${img.id}">
      <div class="library-image-wrapper">
        <img src="${img.thumbnail_url || img.url}" alt="Review image" loading="lazy" onclick="viewAdminImage('${img.id}')">
      </div>
      <div class="admin-review-info">
        <div class="review-user">User: ${img.user_id?.substring(0, 8)}...</div>
        <div class="review-date">${formatDate(img.created_at)}</div>
        ${img.moderation_flags?.reasons?.length > 0 ? `
          <div class="review-flags">
            <strong>Flags:</strong> ${img.moderation_flags.reasons.join(', ')}
          </div>
        ` : ''}
        ${img.celebrity_confidence ? `
          <div class="review-confidence">Celebrity: ${img.celebrity_confidence.toFixed(1)}%</div>
        ` : ''}
        ${img.appeal_reason ? `
          <div class="review-appeal">
            <strong>Appeal:</strong> ${img.appeal_reason}
          </div>
        ` : ''}
        <div class="admin-review-actions">
          <button class="library-btn approve" onclick="adminReviewImage('${img.id}', 'approved')">Approve</button>
          <button class="library-btn reject" onclick="adminReviewImage('${img.id}', 'rejected')">Reject</button>
        </div>
      </div>
    </div>
  `).join('');
}

// View admin image
async function viewAdminImage(imageId) {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    const response = await fetch(`${API_BASE_URL}/api/user-images/admin/${imageId}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!response.ok) throw new Error('Failed to load image');

    const data = await response.json();

    if (data.image?.url) {
      const win = window.open();
      win.document.write(`<img src="${data.image.url}" style="max-width: 100%; max-height: 100vh;">`);
    }
  } catch (error) {
    console.error('Failed to view admin image:', error);
  }
}

// Admin review decision
async function adminReviewImage(imageId, decision, notes = '') {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE_URL}/api/user-images/admin/${imageId}/review`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ decision, notes })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to submit review');
    }

    showToast(`Image ${decision}`);
    loadAdminReviewQueue();

  } catch (error) {
    console.error('Review failed:', error);
    alert(`Failed to submit review: ${error.message}`);
  }
}

// Go back from admin review
function goBackFromAdminReview() {
  document.getElementById('adminImageReviewSection').classList.remove('active');
  document.getElementById('imageSection').classList.add('active');
  document.querySelector('[data-tab="image"]')?.classList.add('active');
}
