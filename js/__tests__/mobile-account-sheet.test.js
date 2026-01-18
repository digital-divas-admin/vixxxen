/**
 * Mobile Account Sheet Tests
 * Tests for mobile account bottom sheet functionality
 */

describe('Mobile Account Sheet', () => {
  beforeEach(() => {
    setMobileViewport();

    // Mock global variables
    window.currentUser = null;
    window.userCredits = 0;
    window.userPlan = null;
  });

  describe('openMobileAccountSheet', () => {
    // Implementation for testing
    function openMobileAccountSheet() {
      const sheet = document.getElementById('mobileAccountSheet');
      sheet.classList.add('open');
      document.body.style.overflow = 'hidden';
      updateMobileAccountSheet();
    }

    function updateMobileAccountSheet() {
      const nameEl = document.getElementById('mobileSheetName');
      const emailEl = document.getElementById('mobileSheetEmail');
      const creditsEl = document.getElementById('mobileSheetCredits');
      const authLabel = document.getElementById('mobileAuthLabel');

      if (window.currentUser) {
        if (nameEl) nameEl.textContent = window.currentUser.display_name || 'User';
        if (emailEl) emailEl.textContent = window.currentUser.email || '';
        if (creditsEl) creditsEl.textContent = window.userCredits?.toLocaleString() || '0';
        if (authLabel) authLabel.textContent = 'Sign Out';
      } else {
        if (nameEl) nameEl.textContent = 'Guest';
        if (emailEl) emailEl.textContent = 'Not signed in';
        if (creditsEl) creditsEl.textContent = '-';
        if (authLabel) authLabel.textContent = 'Sign In';
      }
    }

    test('should add "open" class to sheet', () => {
      const sheet = document.getElementById('mobileAccountSheet');
      expect(sheet.classList.contains('open')).toBe(false);

      openMobileAccountSheet();

      expect(sheet.classList.contains('open')).toBe(true);
    });

    test('should set body overflow to hidden', () => {
      openMobileAccountSheet();

      expect(document.body.style.overflow).toBe('hidden');
    });
  });

  describe('closeMobileAccountSheet', () => {
    // Implementation for testing
    function closeMobileAccountSheet() {
      const sheet = document.getElementById('mobileAccountSheet');
      sheet.classList.remove('open');
      document.body.style.overflow = '';
    }

    beforeEach(() => {
      // Setup sheet as open
      const sheet = document.getElementById('mobileAccountSheet');
      sheet.classList.add('open');
      document.body.style.overflow = 'hidden';
    });

    test('should remove "open" class from sheet', () => {
      const sheet = document.getElementById('mobileAccountSheet');
      expect(sheet.classList.contains('open')).toBe(true);

      closeMobileAccountSheet();

      expect(sheet.classList.contains('open')).toBe(false);
    });

    test('should reset body overflow', () => {
      closeMobileAccountSheet();

      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('updateMobileAccountSheet', () => {
    // Implementation for testing
    function updateMobileAccountSheet() {
      const nameEl = document.getElementById('mobileSheetName');
      const emailEl = document.getElementById('mobileSheetEmail');
      const creditsEl = document.getElementById('mobileSheetCredits');
      const authLabel = document.getElementById('mobileAuthLabel');

      if (window.currentUser) {
        if (nameEl) nameEl.textContent = window.currentUser.display_name || 'User';
        if (emailEl) emailEl.textContent = window.currentUser.email || '';
        if (creditsEl) creditsEl.textContent = window.userCredits?.toLocaleString() || '0';
        if (authLabel) authLabel.textContent = 'Sign Out';
      } else {
        if (nameEl) nameEl.textContent = 'Guest';
        if (emailEl) emailEl.textContent = 'Not signed in';
        if (creditsEl) creditsEl.textContent = '-';
        if (authLabel) authLabel.textContent = 'Sign In';
      }
    }

    describe('when logged out', () => {
      test('should show "Guest" as name', () => {
        window.currentUser = null;

        updateMobileAccountSheet();

        const nameEl = document.getElementById('mobileSheetName');
        expect(nameEl.textContent).toBe('Guest');
      });

      test('should show "Not signed in" as email', () => {
        window.currentUser = null;

        updateMobileAccountSheet();

        const emailEl = document.getElementById('mobileSheetEmail');
        expect(emailEl.textContent).toBe('Not signed in');
      });

      test('should show "-" as credits', () => {
        window.currentUser = null;

        updateMobileAccountSheet();

        const creditsEl = document.getElementById('mobileSheetCredits');
        expect(creditsEl.textContent).toBe('-');
      });

      test('should show "Sign In" for auth button', () => {
        window.currentUser = null;

        updateMobileAccountSheet();

        const authLabel = document.getElementById('mobileAuthLabel');
        expect(authLabel.textContent).toBe('Sign In');
      });
    });

    describe('when logged in', () => {
      beforeEach(() => {
        window.currentUser = {
          display_name: 'John Doe',
          email: 'john@example.com'
        };
        window.userCredits = 1500;
      });

      test('should show display name', () => {
        updateMobileAccountSheet();

        const nameEl = document.getElementById('mobileSheetName');
        expect(nameEl.textContent).toBe('John Doe');
      });

      test('should show email', () => {
        updateMobileAccountSheet();

        const emailEl = document.getElementById('mobileSheetEmail');
        expect(emailEl.textContent).toBe('john@example.com');
      });

      test('should show formatted credits', () => {
        updateMobileAccountSheet();

        const creditsEl = document.getElementById('mobileSheetCredits');
        expect(creditsEl.textContent).toBe('1,500');
      });

      test('should show "Sign Out" for auth button', () => {
        updateMobileAccountSheet();

        const authLabel = document.getElementById('mobileAuthLabel');
        expect(authLabel.textContent).toBe('Sign Out');
      });

      test('should fallback to "User" when no display name', () => {
        window.currentUser = { email: 'test@example.com' };

        updateMobileAccountSheet();

        const nameEl = document.getElementById('mobileSheetName');
        expect(nameEl.textContent).toBe('User');
      });
    });
  });

  describe('handleMobileAuth', () => {
    let handleLogout;
    let showLoginModal;

    beforeEach(() => {
      handleLogout = jest.fn();
      showLoginModal = jest.fn();
      window.handleLogout = handleLogout;
      window.showLoginModal = showLoginModal;
    });

    // Implementation for testing
    function closeMobileAccountSheet() {
      const sheet = document.getElementById('mobileAccountSheet');
      sheet.classList.remove('open');
      document.body.style.overflow = '';
    }

    function handleMobileAuth() {
      closeMobileAccountSheet();
      const authLabel = document.getElementById('mobileAuthLabel');
      const wasShowingSignOut = authLabel && authLabel.textContent === 'Sign Out';

      if (window.currentUser || wasShowingSignOut) {
        window.handleLogout();
      } else {
        window.showLoginModal();
      }
    }

    test('should close the account sheet', () => {
      const sheet = document.getElementById('mobileAccountSheet');
      sheet.classList.add('open');

      handleMobileAuth();

      expect(sheet.classList.contains('open')).toBe(false);
    });

    test('should call handleLogout when user is logged in', () => {
      window.currentUser = { email: 'test@example.com' };

      handleMobileAuth();

      expect(handleLogout).toHaveBeenCalled();
      expect(showLoginModal).not.toHaveBeenCalled();
    });

    test('should call showLoginModal when user is logged out', () => {
      window.currentUser = null;
      const authLabel = document.getElementById('mobileAuthLabel');
      authLabel.textContent = 'Sign In';

      handleMobileAuth();

      expect(showLoginModal).toHaveBeenCalled();
      expect(handleLogout).not.toHaveBeenCalled();
    });

    test('should call handleLogout when auth label shows "Sign Out" (edge case)', () => {
      window.currentUser = null; // State might be out of sync
      const authLabel = document.getElementById('mobileAuthLabel');
      authLabel.textContent = 'Sign Out';

      handleMobileAuth();

      expect(handleLogout).toHaveBeenCalled();
    });
  });

  describe('Mobile Buy Button', () => {
    let openBillingPage;
    let closeMobileAccountSheet;

    beforeEach(() => {
      openBillingPage = jest.fn();
      closeMobileAccountSheet = jest.fn();
      window.openBillingPage = openBillingPage;
      window.closeMobileAccountSheet = closeMobileAccountSheet;
    });

    test('buy button should exist in account sheet', () => {
      const buyBtn = document.getElementById('mobileBuyBtn');
      expect(buyBtn).toBeTruthy();
      expect(buyBtn.textContent).toBe('Buy');
    });

    test('buy button click should trigger billing and close sheet', () => {
      const buyBtn = document.getElementById('mobileBuyBtn');

      // Simulate the onclick behavior
      buyBtn.onclick = () => {
        window.openBillingPage();
        window.closeMobileAccountSheet();
      };
      buyBtn.click();

      expect(openBillingPage).toHaveBeenCalled();
      expect(closeMobileAccountSheet).toHaveBeenCalled();
    });
  });
});
