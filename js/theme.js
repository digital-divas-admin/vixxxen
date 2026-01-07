// ===========================================
// THEME - Light/Dark Mode Toggle
// ===========================================

// Toggle between light and dark theme
function toggleTheme() {
  const body = document.body;
  const themeIcon = document.getElementById('themeIcon');
  const isLight = body.classList.toggle('light-theme');

  // Update icon
  themeIcon.textContent = isLight ? '☀️' : '🌙';

  // Save preference
  localStorage.setItem('vixxxen-theme', isLight ? 'light' : 'dark');
}

// Apply saved theme on page load
function applySavedTheme() {
  const savedTheme = localStorage.getItem('vixxxen-theme');
  const themeIcon = document.getElementById('themeIcon');

  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    if (themeIcon) themeIcon.textContent = '☀️';
  } else {
    document.body.classList.remove('light-theme');
    if (themeIcon) themeIcon.textContent = '🌙';
  }
}

// Call on page load
document.addEventListener('DOMContentLoaded', applySavedTheme);
