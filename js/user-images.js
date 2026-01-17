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
    const canUse = img.status === 'auto_approved' || img.status === 'approved';
    const isRejected = img.status === 'rejected';

    // Rejection notes display
    const rejectionNotesHtml = isRejected && img.review_notes
      ? `<div class="lib-rejection-notes" title="${escapeHtml(img.review_notes)}">
           <span class="rejection-icon">📋</span>
           <span class="rejection-text">${escapeHtml(img.review_notes)}</span>
         </div>`
      : '';

    // Use image actions for approved images
    const useActionsHtml = canUse
      ? `<div class="lib-use-actions" onclick="event.stopPropagation()">
           <button class="lib-use-btn" onclick="useLibImageFor('${img.id}', '${img.url}', 'seedream')" title="Use in Seedream 4.5">
             <span>🎨</span> Seedream
           </button>
           <button class="lib-use-btn" onclick="useLibImageFor('${img.id}', '${img.url}', 'nanobanana')" title="Use in NanoBanana Pro">
             <span>🍌</span> NanoBanana
           </button>
           <button class="lib-use-btn" onclick="useLibImageFor('${img.id}', '${img.url}', 'inpaint')" title="Use in Inpaint">
             <span>🖌️</span> Inpaint
           </button>
           <button class="lib-use-btn" onclick="useLibImageFor('${img.id}', '${img.url}', 'edit')" title="Use in Edit">
             <span>✂️</span> Edit
           </button>
         </div>`
      : '';

    return `
      <div class="library-modal-item ${statusClass}" data-id="${img.id}">
        <div class="lib-image-wrapper" onclick="viewLibImage('${img.id}')">
          <img src="${img.thumbnail_url || img.url}" alt="Library image" loading="lazy">
          <span class="library-item-badge ${statusClass.replace('status-', '')}">${statusLabel}</span>
        </div>
        ${rejectionNotesHtml}
        ${useActionsHtml}
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
  if (status === 'auto_approved') return 'Auto ✓';
  if (status === 'approved') return 'Approved';
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

/**
 * Use a library image in a specific tool
 * @param {string} imageId - The image ID
 * @param {string} imageUrl - The signed URL of the image
 * @param {string} tool - Which tool to use: 'seedream', 'nanobanana', 'inpaint', 'edit'
 */
async function useLibImageFor(imageId, imageUrl, tool) {
  try {
    // Close the library modal
    closeImageLibraryModal();

    // Show loading state
    showToast(`Loading image for ${tool}...`);

    // Fetch the actual image data
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error('Failed to fetch image');

    const blob = await response.blob();
    const reader = new FileReader();

    reader.onload = function(e) {
      const imageDataUrl = e.target.result;

      switch (tool) {
        case 'seedream':
          // Set as reference image for Seedream
          setReferenceImageForTool(imageDataUrl, 'seedream');
          break;

        case 'nanobanana':
          // Set as reference image for NanoBanana Pro
          setReferenceImageForTool(imageDataUrl, 'nanobanana');
          break;

        case 'inpaint':
          // Load into inpaint canvas
          loadImageForInpaint(imageDataUrl);
          break;

        case 'edit':
          // Load into edit tab
          loadImageForEdit(imageDataUrl);
          break;

        default:
          console.error('Unknown tool:', tool);
      }
    };

    reader.readAsDataURL(blob);

  } catch (error) {
    console.error('Failed to use image:', error);
    showToast('Failed to load image');
  }
}

/**
 * Set a reference image for Seedream or NanoBanana Pro
 */
function setReferenceImageForTool(imageDataUrl, tool) {
  // Switch to generate tab
  const generateTab = document.querySelector('[data-tab="generate"]');
  if (generateTab) generateTab.click();

  // Find the reference image input and set it
  // The exact implementation depends on how the tools handle reference images
  if (tool === 'seedream') {
    // Look for Seedream 4.5 reference input
    const seedreamRefPreview = document.getElementById('referenceImagePreview');
    const seedreamRefData = document.getElementById('referenceImageData');

    if (seedreamRefPreview && seedreamRefData) {
      seedreamRefPreview.innerHTML = `<img src="${imageDataUrl}" alt="Reference">`;
      seedreamRefPreview.style.display = 'block';
      seedreamRefData.value = imageDataUrl;
      showToast('Image set as Seedream 4.5 reference');
    } else {
      // Try to find and set using a file input simulation
      trySetReferenceImage(imageDataUrl, 'seedream');
    }
  } else if (tool === 'nanobanana') {
    // Look for NanoBanana Pro reference input
    const nanoRefPreview = document.getElementById('nanoReferencePreview');
    const nanoRefData = document.getElementById('nanoReferenceData');

    if (nanoRefPreview && nanoRefData) {
      nanoRefPreview.innerHTML = `<img src="${imageDataUrl}" alt="Reference">`;
      nanoRefPreview.style.display = 'block';
      nanoRefData.value = imageDataUrl;
      showToast('Image set as NanoBanana Pro reference');
    } else {
      trySetReferenceImage(imageDataUrl, 'nanobanana');
    }
  }
}

/**
 * Try to set reference image using various methods
 */
function trySetReferenceImage(imageDataUrl, tool) {
  // Store the image data globally so it can be picked up by the generation form
  window.pendingReferenceImage = {
    dataUrl: imageDataUrl,
    tool: tool
  };

  // Try to find the upload zone and trigger it
  const uploadZoneId = tool === 'seedream' ? 'seedreamReferenceZone' : 'nanoReferenceZone';
  const uploadZone = document.getElementById(uploadZoneId);

  if (uploadZone && typeof handleReferenceImageDrop === 'function') {
    // Create a fake file-like object
    const blob = dataURLtoBlob(imageDataUrl);
    const file = new File([blob], 'reference.jpg', { type: 'image/jpeg' });

    // Trigger the drop handler
    handleReferenceImageDrop({ dataTransfer: { files: [file] } }, uploadZone);
    showToast(`Image ready for ${tool === 'seedream' ? 'Seedream 4.5' : 'NanoBanana Pro'}`);
  } else {
    showToast('Please manually add the image as reference');
  }
}

/**
 * Load image for inpainting
 */
function loadImageForInpaint(imageDataUrl) {
  // Switch to inpaint tab
  const inpaintTab = document.querySelector('[data-tab="inpaint"]');
  if (inpaintTab) inpaintTab.click();

  // Try to load image into the inpaint canvas
  const inpaintCanvas = document.getElementById('inpaintCanvas');
  const inpaintSourceImage = document.getElementById('inpaintSourceImage');

  if (inpaintSourceImage) {
    inpaintSourceImage.src = imageDataUrl;
    inpaintSourceImage.style.display = 'block';

    // Store for later use
    if (window.inpaintState) {
      window.inpaintState.sourceImage = imageDataUrl;
    }

    showToast('Image loaded for inpainting');
  } else if (typeof loadInpaintImage === 'function') {
    loadInpaintImage(imageDataUrl);
    showToast('Image loaded for inpainting');
  } else {
    // Fallback: store globally
    window.pendingInpaintImage = imageDataUrl;
    showToast('Image ready - click on inpaint canvas to load');
  }
}

/**
 * Load image for editing
 */
function loadImageForEdit(imageDataUrl) {
  // Switch to edit tab
  const editTab = document.querySelector('[data-tab="edit"]');
  if (editTab) editTab.click();

  // Try to load image into the edit canvas
  const editCanvas = document.getElementById('editCanvas');
  const editSourceImage = document.getElementById('editSourceImage');

  if (editSourceImage) {
    editSourceImage.src = imageDataUrl;
    editSourceImage.style.display = 'block';
    showToast('Image loaded for editing');
  } else if (typeof loadEditImage === 'function') {
    loadEditImage(imageDataUrl);
    showToast('Image loaded for editing');
  } else {
    // Fallback: store globally
    window.pendingEditImage = imageDataUrl;
    showToast('Image ready - use in edit tab');
  }
}

/**
 * Convert data URL to Blob
 */
function dataURLtoBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}
