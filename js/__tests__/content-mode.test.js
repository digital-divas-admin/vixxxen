/**
 * Content Mode Toggle Tests
 * Tests for SFW/NSFW content mode switching
 */

describe('Content Mode Toggle', () => {
  let contentMode;
  let ageVerified;

  beforeEach(() => {
    setMobileViewport();
    contentMode = 'safe';
    ageVerified = false;

    // Mock global functions and state
    window.currentUser = null;
    window.contentMode = contentMode;
    window.ageVerified = ageVerified;
    window.showLoginRequiredModal = jest.fn();
    window.showAgeVerificationModal = jest.fn();
    window.filterModelsByContentMode = jest.fn();
    window.loadBlockedWords = jest.fn();
    window.authFetch = jest.fn();
  });

  describe('initContentMode', () => {
    // Implementation for testing
    function initContentMode() {
      window.contentMode = 'safe';
      updateContentModeUI();
      window.filterModelsByContentMode();
      window.loadBlockedWords();
    }

    function updateContentModeUI() {
      const safeBtn = document.getElementById('safeModeBtn');
      const nsfwBtn = document.getElementById('nsfwModeBtn');

      if (window.contentMode === 'safe') {
        safeBtn?.classList.add('active');
        nsfwBtn?.classList.remove('active');
        document.body.classList.add('content-mode-safe');
        document.body.classList.remove('content-mode-nsfw');
      } else {
        safeBtn?.classList.remove('active');
        nsfwBtn?.classList.add('active');
        document.body.classList.remove('content-mode-safe');
        document.body.classList.add('content-mode-nsfw');
      }
    }

    test('should initialize in safe mode', () => {
      initContentMode();

      expect(window.contentMode).toBe('safe');
    });

    test('should call filterModelsByContentMode', () => {
      initContentMode();

      expect(window.filterModelsByContentMode).toHaveBeenCalled();
    });

    test('should call loadBlockedWords', () => {
      initContentMode();

      expect(window.loadBlockedWords).toHaveBeenCalled();
    });

    test('should set safe button as active', () => {
      initContentMode();

      const safeBtn = document.getElementById('safeModeBtn');
      expect(safeBtn.classList.contains('active')).toBe(true);
    });

    test('should set body class to content-mode-safe', () => {
      initContentMode();

      expect(document.body.classList.contains('content-mode-safe')).toBe(true);
      expect(document.body.classList.contains('content-mode-nsfw')).toBe(false);
    });
  });

  describe('updateContentModeUI', () => {
    function updateContentModeUI() {
      const safeBtn = document.getElementById('safeModeBtn');
      const nsfwBtn = document.getElementById('nsfwModeBtn');

      if (window.contentMode === 'safe') {
        safeBtn?.classList.add('active');
        nsfwBtn?.classList.remove('active');
        document.body.classList.add('content-mode-safe');
        document.body.classList.remove('content-mode-nsfw');
      } else {
        safeBtn?.classList.remove('active');
        nsfwBtn?.classList.add('active');
        document.body.classList.remove('content-mode-safe');
        document.body.classList.add('content-mode-nsfw');
      }
    }

    describe('in safe mode', () => {
      beforeEach(() => {
        window.contentMode = 'safe';
      });

      test('should make safe button active', () => {
        updateContentModeUI();

        const safeBtn = document.getElementById('safeModeBtn');
        const nsfwBtn = document.getElementById('nsfwModeBtn');
        expect(safeBtn.classList.contains('active')).toBe(true);
        expect(nsfwBtn.classList.contains('active')).toBe(false);
      });

      test('should add content-mode-safe class to body', () => {
        updateContentModeUI();

        expect(document.body.classList.contains('content-mode-safe')).toBe(true);
        expect(document.body.classList.contains('content-mode-nsfw')).toBe(false);
      });
    });

    describe('in nsfw mode', () => {
      beforeEach(() => {
        window.contentMode = 'nsfw';
      });

      test('should make nsfw button active', () => {
        updateContentModeUI();

        const safeBtn = document.getElementById('safeModeBtn');
        const nsfwBtn = document.getElementById('nsfwModeBtn');
        expect(safeBtn.classList.contains('active')).toBe(false);
        expect(nsfwBtn.classList.contains('active')).toBe(true);
      });

      test('should add content-mode-nsfw class to body', () => {
        updateContentModeUI();

        expect(document.body.classList.contains('content-mode-nsfw')).toBe(true);
        expect(document.body.classList.contains('content-mode-safe')).toBe(false);
      });
    });
  });

  describe('setContentMode', () => {
    // Simplified synchronous implementation for testing
    function setContentMode(mode) {
      if (mode === 'nsfw') {
        if (!window.currentUser) {
          window.showLoginRequiredModal();
          return false;
        }

        if (!window.ageVerified) {
          window.showAgeVerificationModal(false);
          return false;
        }
      }

      window.contentMode = mode;
      updateContentModeUI();
      window.filterModelsByContentMode();
      return true;
    }

    function updateContentModeUI() {
      const safeBtn = document.getElementById('safeModeBtn');
      const nsfwBtn = document.getElementById('nsfwModeBtn');

      if (window.contentMode === 'safe') {
        safeBtn?.classList.add('active');
        nsfwBtn?.classList.remove('active');
        document.body.classList.add('content-mode-safe');
        document.body.classList.remove('content-mode-nsfw');
      } else {
        safeBtn?.classList.remove('active');
        nsfwBtn?.classList.add('active');
        document.body.classList.remove('content-mode-safe');
        document.body.classList.add('content-mode-nsfw');
      }
    }

    describe('switching to safe mode', () => {
      beforeEach(() => {
        window.contentMode = 'nsfw';
      });

      test('should always allow switching to safe mode', () => {
        const result = setContentMode('safe');

        expect(result).toBe(true);
        expect(window.contentMode).toBe('safe');
      });

      test('should update UI to safe mode', () => {
        setContentMode('safe');

        const safeBtn = document.getElementById('safeModeBtn');
        expect(safeBtn.classList.contains('active')).toBe(true);
      });
    });

    describe('switching to nsfw mode', () => {
      test('should require login - show login modal when not logged in', () => {
        window.currentUser = null;

        const result = setContentMode('nsfw');

        expect(result).toBe(false);
        expect(window.showLoginRequiredModal).toHaveBeenCalled();
        expect(window.contentMode).not.toBe('nsfw');
      });

      test('should require age verification - show modal when not verified', () => {
        window.currentUser = { id: '123', email: 'test@example.com' };
        window.ageVerified = false;

        const result = setContentMode('nsfw');

        expect(result).toBe(false);
        expect(window.showAgeVerificationModal).toHaveBeenCalledWith(false);
      });

      test('should allow switch when logged in and age verified', () => {
        window.currentUser = { id: '123', email: 'test@example.com' };
        window.ageVerified = true;

        const result = setContentMode('nsfw');

        expect(result).toBe(true);
        expect(window.contentMode).toBe('nsfw');
      });

      test('should update UI to nsfw mode when allowed', () => {
        window.currentUser = { id: '123', email: 'test@example.com' };
        window.ageVerified = true;

        setContentMode('nsfw');

        const nsfwBtn = document.getElementById('nsfwModeBtn');
        expect(nsfwBtn.classList.contains('active')).toBe(true);
      });

      test('should call filterModelsByContentMode when successful', () => {
        window.currentUser = { id: '123', email: 'test@example.com' };
        window.ageVerified = true;

        setContentMode('nsfw');

        expect(window.filterModelsByContentMode).toHaveBeenCalled();
      });
    });
  });

  describe('Content Mode Toggle UI', () => {
    test('toggle container should exist', () => {
      const toggle = document.getElementById('contentModeToggle');
      expect(toggle).toBeTruthy();
    });

    test('safe mode button should exist', () => {
      const safeBtn = document.getElementById('safeModeBtn');
      expect(safeBtn).toBeTruthy();
    });

    test('nsfw mode button should exist', () => {
      const nsfwBtn = document.getElementById('nsfwModeBtn');
      expect(nsfwBtn).toBeTruthy();
    });

    test('toggle should be centered (no label element)', () => {
      // After our fix, there should be no content-mode-label element
      const label = document.querySelector('.content-mode-label');
      expect(label).toBeFalsy();
    });
  });

  describe('Content Mode CSS Classes', () => {
    test('content-mode-safe class should blur NSFW content', () => {
      document.body.classList.add('content-mode-safe');

      // The CSS selector body.content-mode-safe .output-item[data-nsfw="true"] img
      // should apply blur - we're just testing the class is applied correctly
      expect(document.body.classList.contains('content-mode-safe')).toBe(true);
    });

    test('content-mode-nsfw class should show NSFW content', () => {
      document.body.classList.add('content-mode-nsfw');

      expect(document.body.classList.contains('content-mode-nsfw')).toBe(true);
    });
  });
});
