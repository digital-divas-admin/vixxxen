// ===========================================
// IMAGE MODERATION MODAL FUNCTIONS
// ===========================================
// Depends on: config.js (currentUser, supabaseClient, API_BASE_URL)
// Shows a popup when an image is flagged during generation

// Store for pending flagged images
let pendingFlaggedImages = [];

/**
 * Show the moderation modal when an image is flagged
 * Called from generation error handlers
 * @param {Object} errorResponse - The error response from the API
 * @param {string} imageData - The base64 image data (if available)
 */
function showModerationModal(errorResponse, imageData = null) {
  const modal = document.getElementById('moderationFlagModal');
  if (!modal) {
    console.error('Moderation modal not found');
    return;
  }

  // Store the image info
  const flaggedInfo = {
    savedImageIds: errorResponse.savedImageIds || [],
    reasons: errorResponse.reasons || [],
    canAppeal: errorResponse.canAppeal,
    imageData: imageData
  };
  pendingFlaggedImages = [flaggedInfo];

  // Update modal content
  const reasonsList = document.getElementById('flagReasonsList');
  const flaggedPreview = document.getElementById('flaggedImagePreview');
  const appealSection = document.getElementById('appealSection');

  // Show reasons
  if (reasonsList) {
    reasonsList.innerHTML = (errorResponse.reasons || ['Content flagged by moderation']).map(r =>
      `<li>${escapeHtml(r)}</li>`
    ).join('');
  }

  // Show image preview if available
  if (flaggedPreview && imageData) {
    flaggedPreview.innerHTML = `<img src="${imageData}" alt="Flagged image">`;
    flaggedPreview.style.display = 'block';
  } else if (flaggedPreview) {
    flaggedPreview.style.display = 'none';
  }

  // Show/hide appeal section and button
  const submitAppealBtn = document.getElementById('submitAppealBtn');
  if (appealSection) {
    if (errorResponse.canAppeal && errorResponse.savedImageIds?.length > 0) {
      appealSection.style.display = 'block';
      if (submitAppealBtn) submitAppealBtn.style.display = 'inline-block';
      document.getElementById('appealReasonInput').value = '';
    } else {
      appealSection.style.display = 'none';
      if (submitAppealBtn) submitAppealBtn.style.display = 'none';
    }
  }

  // Show modal
  modal.classList.add('active');
}

/**
 * Close the moderation modal
 */
function closeModerationModal() {
  const modal = document.getElementById('moderationFlagModal');
  if (modal) {
    modal.classList.remove('active');
  }
  pendingFlaggedImages = [];
}

/**
 * Submit appeal from the moderation modal
 */
async function submitModerationAppeal() {
  const reasonInput = document.getElementById('appealReasonInput');
  const reason = reasonInput?.value?.trim();

  if (!reason) {
    alert('Please explain why you believe this image should be approved');
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

    closeModerationModal();
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
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


// ===========================================
// IMAGE LIBRARY MODAL FUNCTIONS
// ===========================================

let libraryModalFilter = 'all';
let libraryModalImages = [];

/**
 * Open the image library modal
 */
function openImageLibraryModal() {
  // Close user menu
  const userMenu = document.getElementById('userMenu');
  if (userMenu) userMenu.classList.remove('active');

  const modal = document.getElementById('imageLibraryModal');
  if (modal) {
    modal.classList.add('active');
    loadLibraryModalImages();
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
  document.querySelector(`.lib-filter-btn[data-filter="${status === 'pending_review' ? 'pending' : status}"]`)?.classList.add('active');

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
    const response = await fetch(`${API_BASE_URL}/api/user-images/list${statusParam}`, {
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

    if (!response.ok) throw new Error('Failed to load');

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
 * Appeal a library image
 */
function appealLibImage(imageId) {
  // Store the image ID and show the moderation modal in appeal mode
  pendingFlaggedImages = [{ savedImageIds: [imageId], canAppeal: true }];

  const modal = document.getElementById('moderationFlagModal');
  const reasonsList = document.getElementById('flagReasonsList');
  const appealSection = document.getElementById('appealSection');
  const submitAppealBtn = document.getElementById('submitAppealBtn');
  const flaggedPreview = document.getElementById('flaggedImagePreview');

  if (reasonsList) reasonsList.innerHTML = '<li>Image pending review</li>';
  if (flaggedPreview) flaggedPreview.style.display = 'none';
  if (appealSection) appealSection.style.display = 'block';
  if (submitAppealBtn) submitAppealBtn.style.display = 'inline-block';
  document.getElementById('appealReasonInput').value = '';

  // Close library modal and show appeal modal
  closeImageLibraryModal();
  modal.classList.add('active');
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

// Simple toast notification
function showToast(message) {
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
