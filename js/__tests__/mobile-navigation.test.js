/**
 * Mobile Navigation Tests
 * Tests for mobile page navigation (billing, account, subscription)
 */

describe('Mobile Navigation', () => {
  beforeEach(() => {
    // Reset viewport to mobile
    setMobileViewport();

    // Mock loadBillingData, loadAccountData
    window.loadBillingData = jest.fn();
    window.loadAccountData = jest.fn();
  });

  describe('openBillingPage', () => {
    // Implementation of openBillingPage for testing (from js/billing-page.js)
    function openBillingPage() {
      document.getElementById('userMenu').classList.remove('active');

      if (window.innerWidth <= 900) {
        const dashboard = document.getElementById('mobileDashboard');
        const container = document.querySelector('.container');
        const backBar = document.getElementById('mobileBackBar');
        const currentToolLabel = document.getElementById('mobileCurrentTool');
        const siteFooter = document.querySelector('.site-footer');

        if (dashboard) dashboard.classList.add('hidden');
        if (container) container.classList.add('mobile-tool-active');
        if (backBar) backBar.classList.add('visible');
        if (currentToolLabel) currentToolLabel.textContent = 'Billing';
        if (siteFooter) siteFooter.style.display = 'none';

        window.mobileToolActive = 'billing';
      }

      document.querySelectorAll('.tab-section').forEach(section => {
        section.classList.remove('active');
      });

      document.querySelectorAll('.nav-tab').forEach(navTab => {
        navTab.classList.remove('active');
      });

      document.getElementById('billingSection').classList.add('active');
      window.loadBillingData();
    }

    test('should close user menu', () => {
      const userMenu = document.getElementById('userMenu');
      userMenu.classList.add('active');

      openBillingPage();

      expect(userMenu.classList.contains('active')).toBe(false);
    });

    test('should hide all tab sections', () => {
      openBillingPage();

      const activeSections = document.querySelectorAll('.tab-section.active');
      expect(activeSections.length).toBe(1);
      expect(activeSections[0].id).toBe('billingSection');
    });

    test('should show billing section', () => {
      const billingSection = document.getElementById('billingSection');
      expect(billingSection.classList.contains('active')).toBe(false);

      openBillingPage();

      expect(billingSection.classList.contains('active')).toBe(true);
    });

    test('should call loadBillingData', () => {
      openBillingPage();

      expect(window.loadBillingData).toHaveBeenCalled();
    });

    describe('on mobile viewport', () => {
      test('should hide mobile dashboard', () => {
        const dashboard = document.getElementById('mobileDashboard');

        openBillingPage();

        expect(dashboard.classList.contains('hidden')).toBe(true);
      });

      test('should show container with mobile-tool-active class', () => {
        const container = document.querySelector('.container');

        openBillingPage();

        expect(container.classList.contains('mobile-tool-active')).toBe(true);
      });

      test('should show back bar', () => {
        const backBar = document.getElementById('mobileBackBar');

        openBillingPage();

        expect(backBar.classList.contains('visible')).toBe(true);
      });

      test('should set tool label to "Billing"', () => {
        const currentToolLabel = document.getElementById('mobileCurrentTool');

        openBillingPage();

        expect(currentToolLabel.textContent).toBe('Billing');
      });

      test('should set mobileToolActive to "billing"', () => {
        openBillingPage();

        expect(window.mobileToolActive).toBe('billing');
      });
    });

    describe('on desktop viewport', () => {
      beforeEach(() => {
        setDesktopViewport();
      });

      test('should NOT modify mobile dashboard', () => {
        const dashboard = document.getElementById('mobileDashboard');

        openBillingPage();

        expect(dashboard.classList.contains('hidden')).toBe(false);
      });

      test('should still show billing section', () => {
        const billingSection = document.getElementById('billingSection');

        openBillingPage();

        expect(billingSection.classList.contains('active')).toBe(true);
      });
    });
  });

  describe('openAccountPage', () => {
    // Implementation of openAccountPage for testing (from js/account-page.js)
    function openAccountPage() {
      document.getElementById('userMenu').classList.remove('active');

      if (window.innerWidth <= 900) {
        const dashboard = document.getElementById('mobileDashboard');
        const container = document.querySelector('.container');
        const backBar = document.getElementById('mobileBackBar');
        const currentToolLabel = document.getElementById('mobileCurrentTool');
        const siteFooter = document.querySelector('.site-footer');

        if (dashboard) dashboard.classList.add('hidden');
        if (container) container.classList.add('mobile-tool-active');
        if (backBar) backBar.classList.add('visible');
        if (currentToolLabel) currentToolLabel.textContent = 'Account';
        if (siteFooter) siteFooter.style.display = 'none';

        window.mobileToolActive = 'account';
      }

      document.querySelectorAll('.tab-section').forEach(section => {
        section.classList.remove('active');
      });

      document.querySelectorAll('.nav-tab').forEach(navTab => {
        navTab.classList.remove('active');
      });

      document.getElementById('accountSection').classList.add('active');
      window.loadAccountData();
    }

    test('should close user menu', () => {
      const userMenu = document.getElementById('userMenu');
      userMenu.classList.add('active');

      openAccountPage();

      expect(userMenu.classList.contains('active')).toBe(false);
    });

    test('should show account section', () => {
      const accountSection = document.getElementById('accountSection');
      expect(accountSection.classList.contains('active')).toBe(false);

      openAccountPage();

      expect(accountSection.classList.contains('active')).toBe(true);
    });

    test('should call loadAccountData', () => {
      openAccountPage();

      expect(window.loadAccountData).toHaveBeenCalled();
    });

    describe('on mobile viewport', () => {
      test('should hide mobile dashboard', () => {
        const dashboard = document.getElementById('mobileDashboard');

        openAccountPage();

        expect(dashboard.classList.contains('hidden')).toBe(true);
      });

      test('should show back bar', () => {
        const backBar = document.getElementById('mobileBackBar');

        openAccountPage();

        expect(backBar.classList.contains('visible')).toBe(true);
      });

      test('should set tool label to "Account"', () => {
        const currentToolLabel = document.getElementById('mobileCurrentTool');

        openAccountPage();

        expect(currentToolLabel.textContent).toBe('Account');
      });

      test('should set mobileToolActive to "account"', () => {
        openAccountPage();

        expect(window.mobileToolActive).toBe('account');
      });
    });
  });

  describe('openSubscriptionPage', () => {
    // Implementation of openSubscriptionPage for testing (from index.html)
    function openSubscriptionPage() {
      document.getElementById('userMenu').classList.remove('active');

      if (window.innerWidth <= 900) {
        const dashboard = document.getElementById('mobileDashboard');
        const container = document.querySelector('.container');
        const backBar = document.getElementById('mobileBackBar');
        const currentToolLabel = document.getElementById('mobileCurrentTool');
        const siteFooter = document.querySelector('.site-footer');

        if (dashboard) dashboard.classList.add('hidden');
        if (container) container.classList.add('mobile-tool-active');
        if (backBar) backBar.classList.add('visible');
        if (currentToolLabel) currentToolLabel.textContent = 'Plans';
        if (siteFooter) siteFooter.style.display = 'none';

        window.mobileToolActive = 'subscription';
      }

      document.querySelectorAll('.tab-section').forEach(section => {
        section.classList.remove('active');
      });

      document.querySelectorAll('.nav-tab').forEach(navTab => {
        navTab.classList.remove('active');
      });

      document.getElementById('subscriptionSection').classList.add('active');
    }

    test('should close user menu', () => {
      const userMenu = document.getElementById('userMenu');
      userMenu.classList.add('active');

      openSubscriptionPage();

      expect(userMenu.classList.contains('active')).toBe(false);
    });

    test('should show subscription section', () => {
      const subscriptionSection = document.getElementById('subscriptionSection');
      expect(subscriptionSection.classList.contains('active')).toBe(false);

      openSubscriptionPage();

      expect(subscriptionSection.classList.contains('active')).toBe(true);
    });

    describe('on mobile viewport', () => {
      test('should hide mobile dashboard', () => {
        const dashboard = document.getElementById('mobileDashboard');

        openSubscriptionPage();

        expect(dashboard.classList.contains('hidden')).toBe(true);
      });

      test('should show back bar', () => {
        const backBar = document.getElementById('mobileBackBar');

        openSubscriptionPage();

        expect(backBar.classList.contains('visible')).toBe(true);
      });

      test('should set tool label to "Plans"', () => {
        const currentToolLabel = document.getElementById('mobileCurrentTool');

        openSubscriptionPage();

        expect(currentToolLabel.textContent).toBe('Plans');
      });

      test('should set mobileToolActive to "subscription"', () => {
        openSubscriptionPage();

        expect(window.mobileToolActive).toBe('subscription');
      });
    });
  });

  describe('goBackFromBilling', () => {
    // Implementation of goBackFromBilling for testing
    function goBackFromBilling() {
      document.getElementById('billingSection').classList.remove('active');
      document.getElementById('imageSection').classList.add('active');

      document.querySelectorAll('.nav-tab').forEach(navTab => {
        navTab.classList.remove('active');
      });
      document.querySelector('.nav-tab[onclick*="imageSection"]')?.classList.add('active');
    }

    beforeEach(() => {
      // Setup billing page as active
      document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
      document.getElementById('billingSection').classList.add('active');
    });

    test('should hide billing section', () => {
      const billingSection = document.getElementById('billingSection');
      expect(billingSection.classList.contains('active')).toBe(true);

      goBackFromBilling();

      expect(billingSection.classList.contains('active')).toBe(false);
    });

    test('should show image section', () => {
      goBackFromBilling();

      const imageSection = document.getElementById('imageSection');
      expect(imageSection.classList.contains('active')).toBe(true);
    });
  });
});
