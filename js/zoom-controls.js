// ===========================================
// ZOOM CONTROLS - Grid Zoom Slider Functions
// ===========================================

function updateImageGridZoom(value) {
  const outputGrid = document.getElementById('outputGrid');
  if (outputGrid) {
    outputGrid.style.setProperty('--grid-item-size', value + 'px');
  }
  // Save preference
  localStorage.setItem('imageGridZoom', value);
}

function updateVideoGridZoom(value) {
  const videoOutputGrid = document.getElementById('videoOutputGrid');
  if (videoOutputGrid) {
    videoOutputGrid.style.setProperty('--grid-item-size', value + 'px');
  }
  // Save preference
  localStorage.setItem('videoGridZoom', value);
}

// Load saved zoom preferences on page load
function loadZoomPreferences() {
  const savedImageZoom = localStorage.getItem('imageGridZoom');
  const savedVideoZoom = localStorage.getItem('videoGridZoom');

  if (savedImageZoom) {
    const imageSlider = document.getElementById('imageZoomSlider');
    if (imageSlider) {
      imageSlider.value = savedImageZoom;
      updateImageGridZoom(savedImageZoom);
    }
  }

  if (savedVideoZoom) {
    const videoSlider = document.getElementById('videoZoomSlider');
    if (videoSlider) {
      videoSlider.value = savedVideoZoom;
      updateVideoGridZoom(savedVideoZoom);
    }
  }
}

// Initialize zoom preferences when DOM is ready
document.addEventListener('DOMContentLoaded', loadZoomPreferences);
