// ===========================================
// UNIFIED IMAGE LIBRARY MODAL
// ===========================================
// Handles both flagged image alerts and image library viewing
// Depends on: config.js (currentUser, supabaseClient, API_BASE_URL)

// Store for pending flagged images
let pendingFlaggedImages = [];
let libraryModalFilter = 'all';
let libraryModalImages = [];
let currentModalView = 'library'; // 'library' or 'flagged'

/**
 * Show the modal in flagged image mode
 * Called from generation error handlers when an image is rejected
 * @param {Object} errorResponse - The error response from the API
 * @param {string} imageData - The base64 image data (if available)
 */
function showModerationModal(errorResponse, imageData = null) {
  const modal = document.getElementById('imageLibraryModal');
  if (!modal) {
    console.error('Image library modal not found');
    return;
  }

  // Store the image info for appeal
  const flaggedInfo = {
    savedImageIds: errorResponse.savedImageIds || [],
    reasons: errorResponse.reasons || [],
    canAppeal: errorResponse.canAppeal,
    imageData: imageData
  };
  pendingFlaggedImages = [flaggedInfo];
  currentModalView = 'flagged';

  // Switch to flagged view
  switchModalView('flagged');

  // Update modal header
  const title = document.getElementById('libraryModalTitle');
  const header = document.getElementById('libraryModalHeader');
  if (title) title.textContent = 'Image Flagged';
  if (header) header.style.background = 'linear-gradient(135deg, #ff6b6b20, #ffa50020)';

  // Show reasons
  const reasonsList = document.getElementById('flagReasonsList');
  if (reasonsList) {
    reasonsList.innerHTML = (errorResponse.reasons || ['Content flagged by moderation']).map(r =>
      `<li>${escapeHtml(r)}</li>`
    ).join('');
  }

  // Show image preview if available
  const flaggedPreview = document.getElementById('flaggedImagePreview');
  if (flaggedPreview && imageData) {
    flaggedPreview.innerHTML = `<img src="${imageData}" alt="Flagged image" style="max-width: 100%; max-height: 180px; border-radius: 8px;">`;
    flaggedPreview.style.display = 'block';
  } else if (flaggedPreview) {
    flaggedPreview.style.display = 'none';
  }

  // Show/hide appeal section and button
  const appealSection = document.getElementById('appealSection');
  const submitAppealBtn = document.getElementById('submitAppealBtn');
  if (appealSection) {
    if (errorResponse.canAppeal && errorResponse.savedImageIds?.length > 0) {
      appealSection.style.display = 'block';
      if (submitAppealBtn) submitAppealBtn.style.display = 'inline-block';
      const appealInput = document.getElementById('appealReasonInput');
      if (appealInput) appealInput.value = '';
    } else {
      appealSection.style.display = 'none';
      if (submitAppealBtn) submitAppealBtn.style.display = 'none';
    }
  }

  // Show modal
  modal.classList.add('active');
}

/**
 * Open the image library modal in library view
 */
function openImageLibraryModal() {
  // Close user menu if open
  const userMenu = document.getElementById('userMenu');
  if (userMenu) userMenu.classList.remove('active');

  const modal = document.getElementById('imageLibraryModal');
  if (!modal) return;

  currentModalView = 'library';

  // Switch to library view
  switchModalView('library');

  // Reset header
  const title = document.getElementById('libraryModalTitle');
  const header = document.getElementById('libraryModalHeader');
  if (title) title.textContent = 'My Images';
  if (header) header.style.background = '';

  // Hide appeal button in library view
  const submitAppealBtn = document.getElementById('submitAppealBtn');
  if (submitAppealBtn) submitAppealBtn.style.display = 'none';

  // Show modal and load images
  modal.classList.add('active');
  loadLibraryModalImages();
}

/**
 * Switch between flagged and library views within the modal
 */
function switchModalView(view) {
  const flaggedView = document.getElementById('flaggedImageView');
  const libraryView = document.getElementById('libraryGridView');

  if (view === 'flagged') {
    if (flaggedView) flaggedView.style.display = 'block';
    if (libraryView) libraryView.style.display = 'none';
  } else {
    if (flaggedView) flaggedView.style.display = 'none';
    if (libraryView) libraryView.style.display = 'block';
  }
}

/**
 * Close the image library modal
 */
function closeImageLibraryModal() {
  const modal = document.getElementById('imageLibraryModal');
  if (modal) {
    modal.classList.remove('active');
  }
  pendingFlaggedImages = [];
}

// Alias for backwards compatibility
function closeModerationModal() {
  closeImageLibraryModal();
}

/**
 * Submit appeal from the modal
 */
async function submitModerationAppeal() {
  const reasonInput = document.getElementById('appealReasonInput');
  const reason = reasonInput?.value?.trim();

  if (!reason || reason.length < 10) {
    alert('Please provide a reason for your appeal (at least 10 characters)');
    return;
  }

  if (pendingFlaggedImages.length === 0 || !pendingFlaggedImages[0].savedImageIds?.length) {
    alert('No image to appeal');
    return;
  }

  const imageId = pendingFlaggedImages[0].savedImageIds[0];
  const submitBtn = document.getElementById('submitAppealBtn');

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
  }

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

    closeImageLibraryModal();
    showToast('Appeal submitted! We will review your image within 24-48 hours.');

  } catch (error) {
    console.error('Appeal failed:', error);
    alert(`Failed to submit appeal: ${error.message}`);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Appeal';
    }
  }
}

/**
 * Filter library modal images
 */
function filterLibraryModal(status) {
  libraryModalFilter = status;

  // Update active filter button
  document.querySelectorAll('.lib-filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const filterValue = status === 'pending_review' ? 'pending' : status;
  document.querySelector(`.lib-filter-btn[data-filter="${filterValue}"]`)?.classList.add('active');

  loadLibraryModalImages();
}

/**
 * Load images for the library modal
 */
async function loadLibraryModalImages() {
  const grid = document.getElementById('libraryModalGrid');
  if (!grid) return;

  grid.innerHTML = '<div class="library-modal-loading">Loading...</div>';

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      grid.innerHTML = '<div class="library-modal-empty">Please log in to view your images</div>';
      return;
    }

    const statusParam = libraryModalFilter === 'all' ? '' : `?status=${libraryModalFilter}`;
    const response = await fetch(`${API_BASE_URL}/api/user-images${statusParam}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!response.ok) throw new Error('Failed to load images');

    const data = await response.json();
    libraryModalImages = data.images || [];

    renderLibraryModalGrid();

  } catch (error) {
    console.error('Failed to load library:', error);
    grid.innerHTML = `<div class="library-modal-empty">Failed to load images: ${error.message}</div>`;
  }
}

/**
 * Render the library modal grid
 */
function renderLibraryModalGrid() {
  const grid = document.getElementById('libraryModalGrid');
  if (!grid) return;

  if (libraryModalImages.length === 0) {
    grid.innerHTML = '<div class="library-modal-empty">No images found</div>';
    return;
  }

  grid.innerHTML = libraryModalImages.map(img => {
    const statusClass = getLibStatusClass(img.status);
    const statusLabel = getLibStatusLabel(img.status);
    const canAppeal = img.status === 'pending_review' && !img.appeal_submitted_at;

    return `
      <div class="library-modal-item ${statusClass}" onclick="viewLibImage('${img.id}')">
        <img src="${img.thumbnail_url || img.url}" alt="Library image" loading="lazy">
        <span class="library-item-badge ${statusClass.replace('status-', '')}">${statusLabel}</span>
        <div class="library-item-actions" onclick="event.stopPropagation()">
          ${canAppeal ? `<button class="lib-action-btn appeal" onclick="appealLibImage('${img.id}')">Appeal</button>` : ''}
          <button class="lib-action-btn delete" onclick="deleteLibImage('${img.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function getLibStatusClass(status) {
  if (status === 'auto_approved' || status === 'approved') return 'status-approved';
  if (status === 'pending_review') return 'status-pending';
  if (status === 'rejected') return 'status-rejected';
  return '';
}

function getLibStatusLabel(status) {
  if (status === 'auto_approved' || status === 'approved') return 'OK';
  if (status === 'pending_review') return 'Pending';
  if (status === 'rejected') return 'Rejected';
  return status;
}

/**
 * View full library image
 */
async function viewLibImage(imageId) {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    const response = await fetch(`${API_BASE_URL}/api/user-images/${imageId}/data`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });

    if (!response.ok) {
      const errData = await response.json();
      if (response.status === 403) {
        alert(errData.message || 'This image is not approved for viewing');
        return;
      }
      throw new Error('Failed to load');
    }

    const data = await response.json();
    if (data.dataUrl) {
      const win = window.open();
      win.document.write(`<img src="${data.dataUrl}" style="max-width: 100%; max-height: 100vh;">`);
    }
  } catch (error) {
    console.error('Failed to view image:', error);
  }
}

/**
 * Appeal a library image - switches modal to flagged/appeal mode
 */
function appealLibImage(imageId) {
  // Store the image ID for appeal submission
  pendingFlaggedImages = [{ savedImageIds: [imageId], canAppeal: true }];

  // Switch to flagged view within the same modal
  switchModalView('flagged');

  // Update header for appeal mode
  const title = document.getElementById('libraryModalTitle');
  const header = document.getElementById('libraryModalHeader');
  if (title) title.textContent = 'Appeal Image';
  if (header) header.style.background = 'linear-gradient(135deg, #ffa50020, #ff6b6b20)';

  // Show appeal-specific content
  const reasonsList = document.getElementById('flagReasonsList');
  if (reasonsList) reasonsList.innerHTML = '<li>Image is pending review</li>';

  const flaggedPreview = document.getElementById('flaggedImagePreview');
  if (flaggedPreview) flaggedPreview.style.display = 'none';

  const appealSection = document.getElementById('appealSection');
  const submitAppealBtn = document.getElementById('submitAppealBtn');
  if (appealSection) appealSection.style.display = 'block';
  if (submitAppealBtn) submitAppealBtn.style.display = 'inline-block';

  const appealInput = document.getElementById('appealReasonInput');
  if (appealInput) appealInput.value = '';
}

/**
 * Delete a library image
 */
async function deleteLibImage(imageId) {
  if (!confirm('Delete this image?')) return;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE_URL}/api/user-images/${imageId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });

    if (!response.ok) throw new Error('Failed to delete');

    showToast('Image deleted');
    loadLibraryModalImages();

  } catch (error) {
    console.error('Delete failed:', error);
    alert(`Failed to delete: ${error.message}`);
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Simple toast notification
 */
function showToast(message) {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 30000;
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
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: slideIn 0.3s ease;
  `;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
