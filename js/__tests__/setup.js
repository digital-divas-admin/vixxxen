/**
 * Frontend Test Setup
 * Sets up jsdom environment for mobile UI testing
 */

// Mock window.innerWidth for mobile simulation
Object.defineProperty(window, 'innerWidth', {
  writable: true,
  configurable: true,
  value: 375 // Default to mobile width
});

// Helper to set viewport width
global.setViewportWidth = (width) => {
  window.innerWidth = width;
};

// Helper to set mobile viewport
global.setMobileViewport = () => {
  window.innerWidth = 375;
};

// Helper to set desktop viewport
global.setDesktopViewport = () => {
  window.innerWidth = 1200;
};

// Setup basic DOM structure that mobile functions expect
beforeEach(() => {
  document.body.innerHTML = `
    <!-- Mobile Dashboard -->
    <div class="mobile-dashboard" id="mobileDashboard">
      <div class="mobile-dashboard-header">
        <div class="mobile-dashboard-greeting">
          <span class="greeting-text" id="mobileGreeting">Welcome back</span>
          <span class="greeting-credits" id="mobileCredits">Login to see credits</span>
        </div>
        <button class="mobile-dashboard-avatar" id="mobileDashboardAvatar">👤</button>
      </div>
      <div class="mobile-dashboard-tools">
        <button class="mobile-tool-card" data-tool="image">Image</button>
        <button class="mobile-tool-card" data-tool="video">Video</button>
      </div>
    </div>

    <!-- Mobile Account Sheet -->
    <div class="mobile-account-sheet" id="mobileAccountSheet">
      <div class="mobile-sheet-backdrop"></div>
      <div class="mobile-sheet-content">
        <div class="mobile-sheet-header">
          <div class="mobile-sheet-avatar" id="mobileSheetAvatar">👤</div>
          <div class="mobile-sheet-user-info">
            <span class="mobile-sheet-name" id="mobileSheetName">Guest</span>
            <span class="mobile-sheet-email" id="mobileSheetEmail">Not signed in</span>
          </div>
        </div>
        <div class="mobile-sheet-credits">
          <span class="mobile-sheet-credits-label">Credits</span>
          <span class="mobile-sheet-credits-value" id="mobileSheetCredits">-</span>
          <button class="mobile-sheet-buy-btn" id="mobileBuyBtn">Buy</button>
        </div>
        <div class="mobile-sheet-menu">
          <div class="mobile-sheet-item" id="mobileLibraryItem">
            <span class="mobile-sheet-item-icon">🖼️</span>
            <span class="mobile-sheet-item-label">Image Library</span>
          </div>
        </div>
        <div class="mobile-sheet-item mobile-sheet-item-auth" id="mobileAuthItem">
          <span class="mobile-sheet-item-icon">🚪</span>
          <span class="mobile-sheet-item-label" id="mobileAuthLabel">Sign In</span>
        </div>
      </div>
    </div>

    <!-- Mobile Back Bar -->
    <nav class="mobile-back-bar" id="mobileBackBar">
      <button class="mobile-back-btn" id="mobileBackBtn">
        <span class="mobile-back-arrow">←</span>
        <span class="mobile-back-text">Back</span>
      </button>
      <span class="mobile-current-tool" id="mobileCurrentTool">Image</span>
    </nav>

    <!-- Main Container -->
    <div class="container">
      <!-- User Menu -->
      <div class="user-menu" id="userMenu"></div>

      <!-- Tab Sections -->
      <div class="tab-section active" id="imageSection">Image Section</div>
      <div class="tab-section" id="videoSection">Video Section</div>
      <div class="tab-section" id="editSection">Edit Section</div>
      <div class="tab-section" id="inpaintSection">Inpaint Section</div>
      <div class="tab-section" id="captionSection">Caption Section</div>
      <div class="tab-section" id="educationSection">Education Section</div>
      <div class="tab-section" id="marketplaceSection">Marketplace Section</div>
      <div class="tab-section" id="billingSection">Billing Section</div>
      <div class="tab-section" id="accountSection">Account Section</div>
      <div class="tab-section" id="subscriptionSection">Subscription Section</div>

      <!-- Nav Tabs -->
      <div class="nav-tabs">
        <button class="nav-tab active" onclick="switchTab('imageSection')">Image</button>
        <button class="nav-tab" onclick="switchTab('videoSection')">Video</button>
      </div>

      <!-- Content Mode Toggle -->
      <div class="content-mode-toggle" id="contentModeToggle">
        <div class="content-mode-switch">
          <button class="content-mode-btn active" id="safeModeBtn">Safe</button>
          <button class="content-mode-btn nsfw-btn" id="nsfwModeBtn">NSFW</button>
        </div>
        <span class="content-mode-info" id="contentModeInfo">All models</span>
      </div>
    </div>

    <!-- Site Footer -->
    <footer class="site-footer" style="display: flex;"></footer>
  `;

  // Reset mobile tool state
  window.mobileToolActive = null;

  // Reset viewport to mobile
  window.innerWidth = 375;
});

// Clean up after each test
afterEach(() => {
  jest.restoreAllMocks();
});

// Global test timeout
jest.setTimeout(10000);
