// ===========================================
// UTILS - Common Utility Functions
// ===========================================

// Escape HTML to prevent XSS attacks
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show error message in image tab error container
function showError(message, type = 'error') {
  const errorContainer = document.getElementById('errorContainer');
  if (!errorContainer) return;

  const icon = type === 'warning' ? '⚠️' : '❌';
  errorContainer.innerHTML = `
    <div class="error-message" style="${type === 'warning' ? 'background: rgba(255, 165, 0, 0.1); border-color: rgba(255, 165, 0, 0.3);' : ''}">
      ${icon} ${message}
    </div>
  `;

  // Auto-hide after 7 seconds
  setTimeout(() => {
    errorContainer.innerHTML = '';
  }, 7000);
}

// Show error message in video tab error container
function showVideoError(message, type = 'error') {
  const errorContainer = document.getElementById('videoErrorContainer');
  if (!errorContainer) return;

  const icon = type === 'warning' ? '⚠️' : '❌';
  errorContainer.innerHTML = `
    <div class="error-message" style="${type === 'warning' ? 'background: rgba(255, 165, 0, 0.1); border-color: rgba(255, 165, 0, 0.3);' : ''}">
      ${icon} ${message}
    </div>
  `;

  // Auto-hide after 7 seconds
  setTimeout(() => {
    errorContainer.innerHTML = '';
  }, 7000);
}
