// ===========================================
// BULK SELECTION FUNCTIONS
// ===========================================
// Depends on: config.js (currentUser, supabaseClient), utils.js (showError, showVideoError)
// Note: generatedImages and generatedVideos arrays are defined in main inline script

let imageSelectionMode = false;
let videoSelectionMode = false;
let selectedImages = new Set();
let selectedVideos = new Set();

// Toggle image selection mode
function toggleImageSelectionMode() {
  imageSelectionMode = !imageSelectionMode;
  const outputGrid = document.getElementById('outputGrid');
  const toggle = document.getElementById('imageSelectionToggle');
  const toolbar = document.getElementById('imageBulkToolbar');

  if (imageSelectionMode) {
    outputGrid.classList.add('selection-mode');
    toggle.classList.add('active');
    toolbar.classList.add('active');
  } else {
    outputGrid.classList.remove('selection-mode');
    toggle.classList.remove('active');
    toolbar.classList.remove('active');
    // Clear selections when exiting selection mode
    deselectAllImages();
  }
}

// Toggle video selection mode
function toggleVideoSelectionMode() {
  videoSelectionMode = !videoSelectionMode;
  const outputGrid = document.getElementById('videoOutputGrid');
  const toggle = document.getElementById('videoSelectionToggle');
  const toolbar = document.getElementById('videoBulkToolbar');

  if (videoSelectionMode) {
    outputGrid.classList.add('selection-mode');
    toggle.classList.add('active');
    toolbar.classList.add('active');
  } else {
    outputGrid.classList.remove('selection-mode');
    toggle.classList.remove('active');
    toolbar.classList.remove('active');
    // Clear selections when exiting selection mode
    deselectAllVideos();
  }
}

// Toggle individual image selection
function toggleImageSelection(event, checkbox) {
  event.stopPropagation();
  const item = checkbox.closest('.output-item');
  const imageUrl = item.dataset.imageUrl;

  if (selectedImages.has(imageUrl)) {
    selectedImages.delete(imageUrl);
    item.classList.remove('selected');
    checkbox.classList.remove('checked');
  } else {
    selectedImages.add(imageUrl);
    item.classList.add('selected');
    checkbox.classList.add('checked');
  }
  updateImageSelectionCount();
}

// Toggle individual video selection
function toggleVideoSelection(event, checkbox) {
  event.stopPropagation();
  const item = checkbox.closest('.output-item');
  const videoUrl = item.dataset.videoUrl;

  if (selectedVideos.has(videoUrl)) {
    selectedVideos.delete(videoUrl);
    item.classList.remove('selected');
    checkbox.classList.remove('checked');
  } else {
    selectedVideos.add(videoUrl);
    item.classList.add('selected');
    checkbox.classList.add('checked');
  }
  updateVideoSelectionCount();
}

// Select all images
function selectAllImages() {
  const items = document.querySelectorAll('#outputGrid .output-item');
  items.forEach(item => {
    const imageUrl = item.dataset.imageUrl;
    if (imageUrl) {
      selectedImages.add(imageUrl);
      item.classList.add('selected');
      const checkbox = item.querySelector('.select-checkbox');
      if (checkbox) checkbox.classList.add('checked');
    }
  });
  updateImageSelectionCount();
}

// Deselect all images
function deselectAllImages() {
  selectedImages.clear();
  const items = document.querySelectorAll('#outputGrid .output-item');
  items.forEach(item => {
    item.classList.remove('selected');
    const checkbox = item.querySelector('.select-checkbox');
    if (checkbox) checkbox.classList.remove('checked');
  });
  updateImageSelectionCount();
}

// Select all videos
function selectAllVideos() {
  const items = document.querySelectorAll('#videoOutputGrid .output-item');
  items.forEach(item => {
    const videoUrl = item.dataset.videoUrl;
    if (videoUrl) {
      selectedVideos.add(videoUrl);
      item.classList.add('selected');
      const checkbox = item.querySelector('.select-checkbox');
      if (checkbox) checkbox.classList.add('checked');
    }
  });
  updateVideoSelectionCount();
}

// Deselect all videos
function deselectAllVideos() {
  selectedVideos.clear();
  const items = document.querySelectorAll('#videoOutputGrid .output-item');
  items.forEach(item => {
    item.classList.remove('selected');
    const checkbox = item.querySelector('.select-checkbox');
    if (checkbox) checkbox.classList.remove('checked');
  });
  updateVideoSelectionCount();
}

// Update image selection count
function updateImageSelectionCount() {
  const count = selectedImages.size;
  document.getElementById('imageSelectedCount').textContent = count;
  document.getElementById('imageBulkDownloadBtn').disabled = count === 0;
  document.getElementById('imageBulkDeleteBtn').disabled = count === 0;
}

// Update video selection count
function updateVideoSelectionCount() {
  const count = selectedVideos.size;
  document.getElementById('videoSelectedCount').textContent = count;
  document.getElementById('videoBulkDownloadBtn').disabled = count === 0;
  document.getElementById('videoBulkDeleteBtn').disabled = count === 0;
}

// Bulk download images
async function bulkDownloadImages() {
  const count = selectedImages.size;
  if (count === 0) return;

  const downloadBtn = document.getElementById('imageBulkDownloadBtn');
  downloadBtn.disabled = true;
  downloadBtn.innerHTML = `<span class="spinner"></span> Downloading...`;

  let downloaded = 0;
  for (const url of selectedImages) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `vixxxen-${Date.now()}-${++downloaded}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
      // Small delay between downloads to prevent browser blocking
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error('Download failed for:', url, err);
    }
  }

  // Track bulk download for value moment analysis (only trigger value moment once)
  if (downloaded > 0 && window.VxAnalytics && window.VxAnalytics.engagement) {
    window.VxAnalytics.engagement.downloaded('image', { bulk_count: downloaded });
  }

  downloadBtn.disabled = false;
  downloadBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
    Download
  `;

  // Deselect after download
  deselectAllImages();
}

// Bulk download videos
async function bulkDownloadVideos() {
  const count = selectedVideos.size;
  if (count === 0) return;

  const downloadBtn = document.getElementById('videoBulkDownloadBtn');
  downloadBtn.disabled = true;
  downloadBtn.innerHTML = `<span class="spinner"></span> Downloading...`;

  let downloaded = 0;
  for (const url of selectedVideos) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `vixxxen-video-${Date.now()}-${++downloaded}.mp4`;
      link.click();
      URL.revokeObjectURL(link.href);
      // Longer delay for videos
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error('Download failed for:', url, err);
    }
  }

  // Track bulk download for value moment analysis (only trigger value moment once)
  if (downloaded > 0 && window.VxAnalytics && window.VxAnalytics.engagement) {
    window.VxAnalytics.engagement.downloaded('video', { bulk_count: downloaded });
  }

  downloadBtn.disabled = false;
  downloadBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
    Download
  `;

  // Deselect after download
  deselectAllVideos();
}

// Bulk delete images
async function bulkDeleteImages() {
  const count = selectedImages.size;
  if (count === 0) return;

  if (!confirm(`Delete ${count} selected image${count > 1 ? 's' : ''}? This cannot be undone.`)) return;

  const deleteBtn = document.getElementById('imageBulkDeleteBtn');
  deleteBtn.disabled = true;
  deleteBtn.innerHTML = `<span class="spinner"></span> Deleting...`;

  let deleted = 0;
  const errors = [];

  for (const imageUrl of selectedImages) {
    try {
      // Find the element
      const item = document.querySelector(`#outputGrid .output-item[data-image-url="${CSS.escape(imageUrl)}"]`);
      if (!item) continue;

      const imageId = item.dataset.imageId;

      // Delete from database/storage if we have an ID
      if (imageId && currentUser) {
        // Get storage path
        const { data: imageData } = await supabaseClient
          .from('generated_images')
          .select('storage_path')
          .eq('id', imageId)
          .single();

        if (imageData?.storage_path) {
          await supabaseClient.storage
            .from('generated-images')
            .remove([imageData.storage_path]);
        }

        // Delete from database
        await supabaseClient
          .from('generated_images')
          .delete()
          .eq('id', imageId);
      }

      // Remove from local array
      const index = generatedImages.findIndex(img => img.url === imageUrl);
      if (index > -1) {
        generatedImages.splice(index, 1);
      }

      // Remove from DOM
      item.style.opacity = '0';
      item.style.transform = 'scale(0.8)';
      setTimeout(() => item.remove(), 300);
      deleted++;
    } catch (err) {
      console.error('Failed to delete image:', imageUrl, err);
      errors.push(imageUrl);
    }
  }

  deleteBtn.disabled = false;
  deleteBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
    Delete
  `;

  // Clear selections
  selectedImages.clear();
  updateImageSelectionCount();

  if (errors.length > 0) {
    showError(`Failed to delete ${errors.length} image${errors.length > 1 ? 's' : ''}`);
  }

  console.log(`Bulk deleted ${deleted} image${deleted > 1 ? 's' : ''}`);
}

// Bulk delete videos
async function bulkDeleteVideos() {
  const count = selectedVideos.size;
  if (count === 0) return;

  if (!confirm(`Delete ${count} selected video${count > 1 ? 's' : ''}? This cannot be undone.`)) return;

  const deleteBtn = document.getElementById('videoBulkDeleteBtn');
  deleteBtn.disabled = true;
  deleteBtn.innerHTML = `<span class="spinner"></span> Deleting...`;

  let deleted = 0;
  const errors = [];

  for (const videoUrl of selectedVideos) {
    try {
      // Find the element
      const item = document.querySelector(`#videoOutputGrid .output-item[data-video-url="${CSS.escape(videoUrl)}"]`);
      if (!item) continue;

      const videoId = item.dataset.videoId;

      // Delete from database/storage if we have an ID
      if (videoId && currentUser) {
        // Get storage path
        const { data: videoData } = await supabaseClient
          .from('generated_videos')
          .select('storage_path')
          .eq('id', videoId)
          .single();

        if (videoData?.storage_path) {
          await supabaseClient.storage
            .from('generated-videos')
            .remove([videoData.storage_path]);
        }

        // Delete from database
        await supabaseClient
          .from('generated_videos')
          .delete()
          .eq('id', videoId);
      }

      // Remove from local array
      const index = generatedVideos.findIndex(v => v.url === videoUrl);
      if (index > -1) {
        generatedVideos.splice(index, 1);
      }

      // Remove from DOM
      item.style.opacity = '0';
      item.style.transform = 'scale(0.8)';
      setTimeout(() => item.remove(), 300);
      deleted++;
    } catch (err) {
      console.error('Failed to delete video:', videoUrl, err);
      errors.push(videoUrl);
    }
  }

  deleteBtn.disabled = false;
  deleteBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
    Delete
  `;

  // Clear selections
  selectedVideos.clear();
  updateVideoSelectionCount();

  if (errors.length > 0) {
    showVideoError(`Failed to delete ${errors.length} video${errors.length > 1 ? 's' : ''}`);
  }

  console.log(`Bulk deleted ${deleted} video${deleted > 1 ? 's' : ''}`);
}
