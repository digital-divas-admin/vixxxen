/**
 * Mobile Dashboard Tests
 * Tests for mobile dashboard navigation and state management
 */

describe('Mobile Dashboard', () => {
  // Tool display name mappings (from index.html)
  const toolDisplayNames = {
    'image': 'Image',
    'video': 'Video',
    'edit': 'Edit',
    'inpaint': 'Inpaint',
    'caption': 'Caption',
    'marketplace': 'Marketplace',
    'education': 'Learn'
  };

  // Mock switchMainTab function
  let switchMainTab;

  beforeEach(() => {
    // Reset viewport to mobile
    setMobileViewport();

    // Mock switchMainTab
    switchMainTab = jest.fn();
    window.switchMainTab = switchMainTab;

    // Mock sessionStorage
    const sessionStorageMock = {
      store: {},
      getItem: jest.fn((key) => sessionStorageMock.store[key] || null),
      setItem: jest.fn((key, value) => { sessionStorageMock.store[key] = value; }),
      removeItem: jest.fn((key) => { delete sessionStorageMock.store[key]; }),
      clear: jest.fn(() => { sessionStorageMock.store = {}; })
    };
    Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });
  });

  describe('openToolFromDashboard', () => {
    // Implementation of openToolFromDashboard for testing
    function openToolFromDashboard(tool) {
      if (window.innerWidth > 900) return;

      const dashboard = document.getElementById('mobileDashboard');
      const container = document.querySelector('.container');
      const backBar = document.getElementById('mobileBackBar');
      const currentToolLabel = document.getElementById('mobileCurrentTool');
      const siteFooter = document.querySelector('.site-footer');

      dashboard.classList.add('hidden');
      container.classList.add('mobile-tool-active');
      backBar.classList.add('visible');
      if (siteFooter) siteFooter.style.display = 'flex';
      currentToolLabel.textContent = toolDisplayNames[tool] || tool;
      switchMainTab(tool);
      window.mobileToolActive = true;
      sessionStorage.setItem('vixxxen_mobileToolActive', tool);
    }

    test('should hide mobile dashboard when opening a tool', () => {
      const dashboard = document.getElementById('mobileDashboard');
      expect(dashboard.classList.contains('hidden')).toBe(false);

      openToolFromDashboard('image');

      expect(dashboard.classList.contains('hidden')).toBe(true);
    });

    test('should show container with mobile-tool-active class', () => {
      const container = document.querySelector('.container');
      expect(container.classList.contains('mobile-tool-active')).toBe(false);

      openToolFromDashboard('image');

      expect(container.classList.contains('mobile-tool-active')).toBe(true);
    });

    test('should show back bar with visible class', () => {
      const backBar = document.getElementById('mobileBackBar');
      expect(backBar.classList.contains('visible')).toBe(false);

      openToolFromDashboard('image');

      expect(backBar.classList.contains('visible')).toBe(true);
    });

    test('should show site footer', () => {
      const siteFooter = document.querySelector('.site-footer');
      siteFooter.style.display = 'none';

      openToolFromDashboard('image');

      expect(siteFooter.style.display).toBe('flex');
    });

    test('should update tool label with correct display name', () => {
      const currentToolLabel = document.getElementById('mobileCurrentTool');

      openToolFromDashboard('image');
      expect(currentToolLabel.textContent).toBe('Image');

      openToolFromDashboard('video');
      expect(currentToolLabel.textContent).toBe('Video');

      openToolFromDashboard('education');
      expect(currentToolLabel.textContent).toBe('Learn');
    });

    test('should call switchMainTab with the tool name', () => {
      openToolFromDashboard('video');

      expect(switchMainTab).toHaveBeenCalledWith('video');
    });

    test('should set mobileToolActive to true', () => {
      expect(window.mobileToolActive).toBeFalsy();

      openToolFromDashboard('image');

      expect(window.mobileToolActive).toBe(true);
    });

    test('should save tool to sessionStorage', () => {
      openToolFromDashboard('inpaint');

      expect(sessionStorage.setItem).toHaveBeenCalledWith('vixxxen_mobileToolActive', 'inpaint');
    });

    test('should NOT execute on desktop viewport', () => {
      setDesktopViewport();
      const dashboard = document.getElementById('mobileDashboard');

      openToolFromDashboard('image');

      expect(dashboard.classList.contains('hidden')).toBe(false);
      expect(switchMainTab).not.toHaveBeenCalled();
    });
  });

  describe('backToDashboard', () => {
    // Implementation of backToDashboard for testing
    function backToDashboard() {
      if (window.innerWidth > 900) return;

      const dashboard = document.getElementById('mobileDashboard');
      const container = document.querySelector('.container');
      const backBar = document.getElementById('mobileBackBar');
      const siteFooter = document.querySelector('.site-footer');

      dashboard.classList.remove('hidden');
      container.classList.remove('mobile-tool-active');
      backBar.classList.remove('visible');
      if (siteFooter) siteFooter.style.display = 'none';
      window.mobileToolActive = false;
      sessionStorage.removeItem('vixxxen_mobileToolActive');
    }

    // Setup tool-active state before each backToDashboard test
    function setupToolActiveState() {
      const dashboard = document.getElementById('mobileDashboard');
      const container = document.querySelector('.container');
      const backBar = document.getElementById('mobileBackBar');

      dashboard.classList.add('hidden');
      container.classList.add('mobile-tool-active');
      backBar.classList.add('visible');
      window.mobileToolActive = true;
    }

    test('should show mobile dashboard', () => {
      setupToolActiveState();
      const dashboard = document.getElementById('mobileDashboard');
      expect(dashboard.classList.contains('hidden')).toBe(true);

      backToDashboard();

      expect(dashboard.classList.contains('hidden')).toBe(false);
    });

    test('should remove mobile-tool-active class from container', () => {
      setupToolActiveState();
      const container = document.querySelector('.container');
      expect(container.classList.contains('mobile-tool-active')).toBe(true);

      backToDashboard();

      expect(container.classList.contains('mobile-tool-active')).toBe(false);
    });

    test('should hide back bar', () => {
      setupToolActiveState();
      const backBar = document.getElementById('mobileBackBar');
      expect(backBar.classList.contains('visible')).toBe(true);

      backToDashboard();

      expect(backBar.classList.contains('visible')).toBe(false);
    });

    test('should hide site footer', () => {
      setupToolActiveState();
      const siteFooter = document.querySelector('.site-footer');
      siteFooter.style.display = 'flex';

      backToDashboard();

      expect(siteFooter.style.display).toBe('none');
    });

    test('should set mobileToolActive to false', () => {
      setupToolActiveState();
      expect(window.mobileToolActive).toBe(true);

      backToDashboard();

      expect(window.mobileToolActive).toBe(false);
    });

    test('should remove tool from sessionStorage', () => {
      setupToolActiveState();

      backToDashboard();

      expect(sessionStorage.removeItem).toHaveBeenCalledWith('vixxxen_mobileToolActive');
    });

    test('should NOT execute on desktop viewport', () => {
      setupToolActiveState();
      setDesktopViewport();
      const dashboard = document.getElementById('mobileDashboard');

      backToDashboard();

      expect(dashboard.classList.contains('hidden')).toBe(true);
    });
  });

  describe('updateMobileDashboard', () => {
    // Mock currentUser and userCredits
    let currentUser;
    let userCredits;

    beforeEach(() => {
      currentUser = null;
      userCredits = null;
      window.currentUser = currentUser;
      window.userCredits = userCredits;
    });

    // Implementation of updateMobileDashboard for testing
    function updateMobileDashboard() {
      const greetingEl = document.getElementById('mobileGreeting');
      const creditsEl = document.getElementById('mobileCredits');

      if (!greetingEl || !creditsEl) return;

      const hour = new Date().getHours();
      let greeting = 'Welcome back';
      if (hour < 12) greeting = 'Good morning';
      else if (hour < 18) greeting = 'Good afternoon';
      else greeting = 'Good evening';

      if (window.currentUser) {
        const name = window.currentUser.display_name || window.currentUser.email?.split('@')[0] || '';
        greetingEl.textContent = name ? `${greeting}, ${name}` : greeting;
        creditsEl.textContent = window.userCredits !== null ? `${window.userCredits} credits` : 'Loading credits...';
      } else {
        greetingEl.textContent = 'Welcome';
        creditsEl.textContent = 'Sign in to get started';
      }
    }

    test('should show "Welcome" and sign in prompt when logged out', () => {
      window.currentUser = null;

      updateMobileDashboard();

      const greetingEl = document.getElementById('mobileGreeting');
      const creditsEl = document.getElementById('mobileCredits');
      expect(greetingEl.textContent).toBe('Welcome');
      expect(creditsEl.textContent).toBe('Sign in to get started');
    });

    test('should show personalized greeting with display name when logged in', () => {
      window.currentUser = { display_name: 'John', email: 'john@example.com' };
      window.userCredits = 100;

      updateMobileDashboard();

      const greetingEl = document.getElementById('mobileGreeting');
      expect(greetingEl.textContent).toMatch(/John$/);
    });

    test('should fallback to email username when no display name', () => {
      window.currentUser = { email: 'jane@example.com' };
      window.userCredits = 50;

      updateMobileDashboard();

      const greetingEl = document.getElementById('mobileGreeting');
      expect(greetingEl.textContent).toMatch(/jane$/);
    });

    test('should show credits count when logged in', () => {
      window.currentUser = { display_name: 'Test' };
      window.userCredits = 250;

      updateMobileDashboard();

      const creditsEl = document.getElementById('mobileCredits');
      expect(creditsEl.textContent).toBe('250 credits');
    });

    test('should show "Loading credits..." when credits are null', () => {
      window.currentUser = { display_name: 'Test' };
      window.userCredits = null;

      updateMobileDashboard();

      const creditsEl = document.getElementById('mobileCredits');
      expect(creditsEl.textContent).toBe('Loading credits...');
    });
  });

  describe('initMobileDashboard', () => {
    let openToolFromDashboard;
    let updateMobileDashboard;

    beforeEach(() => {
      openToolFromDashboard = jest.fn();
      updateMobileDashboard = jest.fn();
      window.openToolFromDashboard = openToolFromDashboard;
      window.updateMobileDashboard = updateMobileDashboard;
    });

    // Implementation of initMobileDashboard for testing
    function initMobileDashboard() {
      if (window.innerWidth > 900) return;

      const savedTool = sessionStorage.getItem('vixxxen_mobileToolActive');
      if (savedTool) {
        window.openToolFromDashboard(savedTool);
      }

      window.updateMobileDashboard();
    }

    test('should restore tool from sessionStorage if previously active', () => {
      sessionStorage.store['vixxxen_mobileToolActive'] = 'video';

      initMobileDashboard();

      expect(openToolFromDashboard).toHaveBeenCalledWith('video');
    });

    test('should NOT restore tool if sessionStorage is empty', () => {
      initMobileDashboard();

      expect(openToolFromDashboard).not.toHaveBeenCalled();
    });

    test('should call updateMobileDashboard', () => {
      initMobileDashboard();

      expect(updateMobileDashboard).toHaveBeenCalled();
    });

    test('should NOT execute on desktop viewport', () => {
      setDesktopViewport();
      sessionStorage.store['vixxxen_mobileToolActive'] = 'video';

      initMobileDashboard();

      expect(openToolFromDashboard).not.toHaveBeenCalled();
      expect(updateMobileDashboard).not.toHaveBeenCalled();
    });
  });
});
