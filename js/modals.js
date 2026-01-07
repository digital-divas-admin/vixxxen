// ===========================================
// MEDIA MODALS - Image/Video Lightbox
// ===========================================
// No dependencies - standalone UI functions

// Show image in fullscreen lightbox modal
function showImageModal(url) {
  console.log('Opening lightbox with URL:', url ? url.substring(0, 100) + '...' : 'EMPTY');
  const modal = document.getElementById('imageModal');
  const modalImage = document.getElementById('modalImage');
  modalImage.src = url;
  modal.classList.add('active');
  // Prevent body scroll when modal is open
  document.body.style.overflow = 'hidden';
}

// Close image lightbox modal
function closeImageModal() {
  const modal = document.getElementById('imageModal');
  modal.classList.remove('active');
  // Re-enable body scroll
  document.body.style.overflow = 'auto';
}

// Show video in fullscreen lightbox modal
function showVideoModal(url) {
  const modal = document.getElementById('videoModal');
  const video = document.getElementById('modalVideo');
  const source = document.getElementById('modalVideoSource');
  source.src = url;
  video.load();
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

// Close video lightbox modal
function closeVideoModal(event) {
  // Only close if clicking the backdrop or close button, not the video
  if (event && event.target.tagName === 'VIDEO') return;
  const modal = document.getElementById('videoModal');
  const video = document.getElementById('modalVideo');
  video.pause();
  modal.classList.remove('active');
  document.body.style.overflow = 'auto';
}

// Keyboard shortcut: Escape to close modals
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const imageModal = document.getElementById('imageModal');
    const videoModal = document.getElementById('videoModal');
    if (imageModal && imageModal.classList.contains('active')) {
      closeImageModal();
    }
    if (videoModal && videoModal.classList.contains('active')) {
      closeVideoModal();
    }
  }
});
