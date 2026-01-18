/**
 * Landing Page Module
 * Handles loading and rendering of landing page content from the CMS
 */

// ===========================================
// LANDING PAGE STATE
// ===========================================

let landingPageData = null;
let landingPageLoaded = false;

// ===========================================
// UTILITIES
// ===========================================

/**
 * Set loading state on a button
 * @param {HTMLElement} button - The button element
 * @param {boolean} isLoading - Whether to show loading state
 */
function setButtonLoading(button, isLoading) {
  if (!button) return;

  if (isLoading) {
    // Store original text and wrap it for hiding
    if (!button.querySelector('.landing-btn__text')) {
      button.innerHTML = `<span class="landing-btn__text">${button.innerHTML}</span>`;
    }
    button.classList.add('landing-btn--loading');
  } else {
    button.classList.remove('landing-btn--loading');
    // Restore original text
    const textSpan = button.querySelector('.landing-btn__text');
    if (textSpan) {
      button.innerHTML = textSpan.innerHTML;
    }
  }
}

// ===========================================
// LANDING PAGE INITIALIZATION
// ===========================================

/**
 * Initialize the landing page
 * Called when user is not logged in
 */
async function initLandingPage() {
  console.log('🏠 Initializing landing page...');

  try {
    // Show landing page, hide main app
    showLandingPage();

    // Load content from API
    await loadLandingPageContent();

    // Initialize scroll animations
    initLandingScrollAnimations();

    // Attach event listeners to CTA buttons
    attachLandingCTAListeners();

    // Preload wizard config in background for instant wizard experience
    if (typeof window.preloadOnboardingConfig === 'function') {
      window.preloadOnboardingConfig();
    }

    console.log('🏠 Landing page initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize landing page:', error);
    // Show fallback content (already in HTML)
    renderFallbackContent();
  }
}

/**
 * Attach event listeners to landing page CTA buttons
 * This is the single source of truth for all CTA button click handling.
 * Button elements in HTML have no inline onclick handlers.
 */
function attachLandingCTAListeners() {
  console.log('🔗 Attaching CTA listeners...');

  // Helper to handle wizard CTA clicks with loading state
  function handleWizardClick(button) {
    if (typeof window.showOnboardingWizard === 'function') {
      setButtonLoading(button, true);
      window.showOnboardingWizard();
      // Clear loading when wizard modal appears or after timeout
      waitForWizardModal(() => setButtonLoading(button, false));
    } else {
      console.error('showOnboardingWizard not available');
      alert('Please wait a moment and try again.');
    }
  }

  // Hero primary CTA - "Start Building"
  const heroCta = document.getElementById('heroPrimaryCta');
  if (heroCta) {
    heroCta.addEventListener('click', function(e) {
      e.preventDefault();
      handleWizardClick(this);
    });
  }

  // Final CTA - "Get Started Free"
  const finalCta = document.getElementById('finalCtaPrimary');
  if (finalCta) {
    finalCta.addEventListener('click', function(e) {
      e.preventDefault();
      handleWizardClick(this);
    });
  }

  // Education CTA - "Explore Courses"
  const educationCta = document.getElementById('educationCta');
  if (educationCta) {
    educationCta.addEventListener('click', function(e) {
      e.preventDefault();
      if (typeof openCoursePreview === 'function') {
        openCoursePreview();
      } else {
        console.error('openCoursePreview not available');
      }
    });
  }

  // Trial CTA - "Try It Now"
  const trialCta = document.getElementById('heroTrialCta');
  if (trialCta) {
    trialCta.addEventListener('click', function(e) {
      e.preventDefault();
      openTrialModal();
    });
  }

  // Secondary CTA - "See How It Works"
  const secondaryCta = document.getElementById('heroSecondaryCta');
  if (secondaryCta) {
    secondaryCta.addEventListener('click', function(e) {
      e.preventDefault();
      scrollToSection('landingPipeline');
    });
  }
}

/**
 * Wait for the wizard modal to appear, then call callback
 * Falls back to timeout if modal doesn't appear
 */
function waitForWizardModal(callback) {
  const maxWait = 3000;
  const checkInterval = 50;
  let elapsed = 0;

  const check = setInterval(() => {
    const modal = document.getElementById('onboardingWizardModal');
    elapsed += checkInterval;

    if (modal || elapsed >= maxWait) {
      clearInterval(check);
      callback();
    }
  }, checkInterval);
}

/**
 * Show landing page and hide main app
 */
function showLandingPage() {
  const landingPage = document.getElementById('landingPage');
  const topNavbar = document.getElementById('topNavbar');
  const container = document.querySelector('.container');
  const mobileOverlay = document.getElementById('mobileOverlay');
  const siteFooter = document.querySelector('.site-footer');
  const mobileDashboard = document.getElementById('mobileDashboard');
  const mobileBackBar = document.getElementById('mobileBackBar');
  const mobileAccountSheet = document.getElementById('mobileAccountSheet');

  if (landingPage) {
    landingPage.style.display = 'block';
  }

  // Hide main app elements
  if (topNavbar) topNavbar.style.display = 'none';
  if (container) container.style.display = 'none';
  if (mobileOverlay) mobileOverlay.style.display = 'none';
  if (siteFooter) siteFooter.style.display = 'none';

  // Hide mobile dashboard elements
  if (mobileDashboard) mobileDashboard.style.display = 'none';
  if (mobileBackBar) mobileBackBar.style.display = 'none';
  if (mobileAccountSheet) mobileAccountSheet.classList.remove('open');

  // Enable scrolling on body for landing page
  document.body.style.overflow = 'auto';
  document.body.style.height = 'auto';

  // Scroll to top
  window.scrollTo(0, 0);
}

/**
 * Hide landing page and show main app
 */
function hideLandingPage() {
  const landingPage = document.getElementById('landingPage');
  const topNavbar = document.getElementById('topNavbar');
  const container = document.querySelector('.container');
  const siteFooter = document.querySelector('.site-footer');
  const mobileDashboard = document.getElementById('mobileDashboard');
  const isMobile = window.innerWidth <= 900;

  if (landingPage) {
    landingPage.style.display = 'none';
  }

  // Show main app elements
  if (topNavbar) topNavbar.style.display = 'flex';
  if (siteFooter) siteFooter.style.display = 'flex';

  // On mobile, show dashboard instead of container
  // On desktop, show container
  if (isMobile) {
    // Show mobile dashboard, hide container (CSS will handle the rest)
    if (mobileDashboard) {
      mobileDashboard.style.display = ''; // Clear inline style, let CSS take over
      mobileDashboard.classList.remove('hidden');
    }
    if (container) {
      container.style.display = ''; // Clear inline style, let CSS take over
      container.classList.remove('mobile-tool-active');
    }
    // Update mobile dashboard with user info
    if (typeof updateMobileDashboard === 'function') {
      updateMobileDashboard();
    }
    // Reset mobile tool state
    if (typeof mobileToolActive !== 'undefined') {
      window.mobileToolActive = false;
    }
    sessionStorage.removeItem('vixxxen_mobileToolActive');
  } else {
    // Desktop - show container normally
    if (container) container.style.display = 'flex';
  }

  // Restore body overflow for main app (desktop only)
  // On mobile (<=900px), CSS handles scrolling via media queries
  if (!isMobile) {
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100vh';
  } else {
    // Clear inline styles so CSS media queries take effect
    document.body.style.overflow = '';
    document.body.style.height = '';
  }
}

// ===========================================
// DATA LOADING
// ===========================================

/**
 * Load landing page content from the API
 */
async function loadLandingPageContent() {
  try {
    const response = await fetch('/api/landing');

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    landingPageData = await response.json();
    landingPageLoaded = true;

    console.log('🏠 Landing page data loaded:', landingPageData);

    // Render all sections
    renderLandingPageContent();

  } catch (error) {
    console.error('❌ Failed to load landing page content:', error);
    // Content will fall back to HTML defaults
  }
}

// ===========================================
// RENDERING
// ===========================================

/**
 * Render all landing page content from loaded data
 */
function renderLandingPageContent() {
  if (!landingPageData) return;

  renderHeroContent();
  renderStats();
  renderCharacters();
  renderPipeline();
  renderShowcase();
  renderCapabilities();
  renderEducationContent();
}

/**
 * Render hero section content
 */
function renderHeroContent() {
  const content = landingPageData.content?.hero;
  if (!content) return;

  const headline = document.getElementById('heroHeadline');
  const subheadline = document.getElementById('heroSubheadline');
  const primaryCta = document.getElementById('heroPrimaryCta');
  const secondaryCta = document.getElementById('heroSecondaryCta');
  const trustBadge = document.getElementById('heroTrustBadge');

  if (headline && content.headline) {
    headline.textContent = content.headline.value;
  }
  if (subheadline && content.subheadline) {
    subheadline.textContent = content.subheadline.value;
  }
  if (primaryCta && content.primary_cta_text) {
    primaryCta.textContent = content.primary_cta_text.value;
  }
  if (secondaryCta && content.secondary_cta_text) {
    secondaryCta.textContent = content.secondary_cta_text.value;
  }
  if (trustBadge && content.trust_badge) {
    trustBadge.textContent = content.trust_badge.value;
  }
}

/**
 * Render stats section
 */
function renderStats() {
  const stats = landingPageData.stats;
  if (!stats || stats.length === 0) return;

  const container = document.getElementById('statsGrid');
  if (!container) return;

  container.innerHTML = stats.map(stat => `
    <div class="landing-stat landing-animate">
      <div class="landing-stat__icon">${stat.icon}</div>
      <div class="landing-stat__value">${stat.value}</div>
      <div class="landing-stat__label">${stat.label}</div>
    </div>
  `).join('');
}

/**
 * Render featured characters section
 */
function renderCharacters() {
  const characters = landingPageData.characters;
  if (!characters || characters.length === 0) return;

  // Update section headlines from content
  const content = landingPageData.content?.characters;
  if (content) {
    const headline = document.getElementById('charactersHeadline');
    const subheadline = document.getElementById('charactersSubheadline');
    if (headline && content.headline) headline.textContent = content.headline.value;
    if (subheadline && content.subheadline) subheadline.textContent = content.subheadline.value;
  }

  const container = document.getElementById('charactersGrid');
  if (!container) return;

  container.innerHTML = characters.map((char, index) => {
    const metrics = typeof char.metrics === 'string' ? JSON.parse(char.metrics) : char.metrics;

    return `
      <div class="landing-character-card landing-animate landing-animate--delay-${index % 3 + 1}">
        <img src="${char.image_url}" alt="${char.name}" class="landing-character-card__image" loading="lazy">
        <div class="landing-character-card__content">
          <div class="landing-character-card__name">${char.name}</div>
          ${char.handle ? `<div class="landing-character-card__handle">${char.handle}</div>` : ''}
          <div class="landing-character-card__metrics">
            ${metrics.map(m => `
              <div class="landing-character-card__metric">
                <span class="landing-character-card__metric-icon">${m.icon}</span>
                <span class="landing-character-card__metric-value">${m.value}</span>
                <span class="landing-character-card__metric-label">${m.label}</span>
              </div>
            `).join('')}
          </div>
          ${char.cta_text ? `<a href="${char.cta_link || '#'}" class="landing-character-card__cta" onclick="openCharacterCaseStudy('${char.id}'); return false;">${char.cta_text}</a>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render pipeline steps section
 */
function renderPipeline() {
  const pipeline = landingPageData.pipeline;
  if (!pipeline || pipeline.length === 0) return;

  // Update section headline from content
  const content = landingPageData.content?.pipeline;
  if (content) {
    const headline = document.getElementById('pipelineHeadline');
    if (headline && content.headline) headline.textContent = content.headline.value;
  }

  const container = document.getElementById('pipelineSteps');
  if (!container) return;

  container.innerHTML = pipeline.map((step, index) => `
    <div class="landing-pipeline-step landing-animate landing-animate--delay-${index % 4 + 1}">
      <div class="landing-pipeline-step__number">${step.step_number}</div>
      <div class="landing-pipeline-step__content">
        <div class="landing-pipeline-step__title">${step.title}</div>
        <div class="landing-pipeline-step__description">${step.description}</div>
      </div>
    </div>
  `).join('');
}

/**
 * Render content showcase section
 */
function renderShowcase() {
  const showcase = landingPageData.showcase;
  if (!showcase || showcase.length === 0) return;

  // Update section headlines from content
  const content = landingPageData.content?.showcase;
  if (content) {
    const headline = document.getElementById('showcaseHeadline');
    const subheadline = document.getElementById('showcaseSubheadline');
    if (headline && content.headline) headline.textContent = content.headline.value;
    if (subheadline && content.subheadline) subheadline.textContent = content.subheadline.value;
  }

  const container = document.getElementById('showcaseGrid');
  if (!container) return;

  container.innerHTML = showcase.map((item, index) => {
    const sizeClass = item.size === 'large' ? 'landing-showcase-item--large' : '';

    return `
      <div class="landing-showcase-item ${sizeClass} landing-animate landing-animate--delay-${index % 4 + 1}">
        <img src="${item.image_url}" alt="${item.caption || 'Showcase'}" class="landing-showcase-item__image" loading="lazy">
        ${item.caption ? `<div class="landing-showcase-item__caption">${item.caption}</div>` : ''}
      </div>
    `;
  }).join('');
}

/**
 * Render capabilities section
 */
function renderCapabilities() {
  const capabilities = landingPageData.capabilities;
  if (!capabilities || capabilities.length === 0) return;

  // Update section headline from content
  const content = landingPageData.content?.capabilities;
  if (content) {
    const headline = document.getElementById('capabilitiesHeadline');
    if (headline && content.headline) headline.textContent = content.headline.value;
  }

  const container = document.getElementById('capabilitiesGrid');
  if (!container) return;

  container.innerHTML = capabilities.map((cap, index) => `
    <div class="landing-capability-card landing-animate landing-animate--delay-${index % 3 + 1}">
      <div class="landing-capability-card__icon">${cap.icon}</div>
      <div class="landing-capability-card__title">${cap.title}</div>
      <div class="landing-capability-card__description">${cap.description}</div>
    </div>
  `).join('');
}

/**
 * Render education section content
 */
function renderEducationContent() {
  const content = landingPageData.content?.education;
  if (!content) return;

  const headline = document.getElementById('educationHeadline');
  const subheadline = document.getElementById('educationSubheadline');
  const cta = document.getElementById('educationCta');
  const bulletsContainer = document.getElementById('educationBullets');

  if (headline && content.headline) {
    headline.textContent = content.headline.value;
  }
  if (subheadline && content.subheadline) {
    subheadline.textContent = content.subheadline.value;
  }
  if (cta && content.cta_text) {
    cta.textContent = content.cta_text.value;
  }

  // Render bullet points
  if (bulletsContainer) {
    const bullets = [];
    for (let i = 1; i <= 10; i++) {
      if (content[`bullet_${i}`]) {
        bullets.push(content[`bullet_${i}`].value);
      }
    }

    if (bullets.length > 0) {
      bulletsContainer.innerHTML = bullets.map(bullet => `
        <li class="landing-education__bullet">${bullet}</li>
      `).join('');
    }
  }
}

/**
 * Render fallback content when API fails
 */
function renderFallbackContent() {
  console.log('🏠 Using fallback landing page content');
  // HTML already contains fallback content, just make sure animations work
  initLandingScrollAnimations();
}

// ===========================================
// SCROLL ANIMATIONS
// ===========================================

/**
 * Initialize scroll-triggered animations
 */
function initLandingScrollAnimations() {
  // Use Intersection Observer for scroll animations
  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -50px 0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('landing-animate--visible');
        // Optionally unobserve after animation
        // observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe all elements with animation class
  document.querySelectorAll('.landing-animate').forEach(el => {
    observer.observe(el);
  });

  // Immediately show hero elements (above fold)
  document.querySelectorAll('.landing-hero .landing-animate').forEach(el => {
    el.classList.add('landing-animate--visible');
  });
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Smooth scroll to a section
 */
function scrollToSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Open the onboarding wizard (overrides the default openLoginModal in index.html)
 * This function is exported to window.openLoginModal to intercept calls from
 * other parts of the app (e.g., toggleUserMenu, purchaseCharacter) and redirect
 * them to the onboarding wizard instead of the simple login modal.
 */
function openLoginModal() {
  if (typeof window.showOnboardingWizard === 'function') {
    window.showOnboardingWizard();
  } else {
    // Fallback to original login modal if wizard isn't ready
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
      loginModal.classList.add('active');
    }
  }
}

/**
 * Open onboarding wizard with a specific pricing tier pre-selected
 * @param {string} tier - The tier key (starter, creator, pro, mentorship)
 */
function openWizardWithTier(tier) {
  console.log('🚀 openWizardWithTier called with tier:', tier);

  // Store the selected tier for the wizard to pick up
  sessionStorage.setItem('selectedPricingTier', tier);

  if (typeof window.showOnboardingWizard === 'function') {
    console.log('✅ Wizard found, opening...');
    window.showOnboardingWizard();
  } else {
    console.warn('❌ Onboarding wizard not available');
    alert('Please refresh the page and try again.');
  }
}

/**
 * Open character case study modal
 * @param {string} characterId - The character ID to show
 */
function openCharacterCaseStudy(characterId) {
  // Find the character data
  const character = landingPageData?.characters?.find(c => c.id === characterId);
  if (!character) {
    console.warn('Character not found:', characterId);
    return;
  }

  showCaseStudyModal(character);
}

/**
 * Show the case study modal with character details
 */
function showCaseStudyModal(character) {
  // Remove existing modal if any
  document.getElementById('caseStudyModal')?.remove();

  const metrics = typeof character.metrics === 'string'
    ? JSON.parse(character.metrics)
    : character.metrics;

  const modal = document.createElement('div');
  modal.id = 'caseStudyModal';
  modal.className = 'landing-modal';
  modal.innerHTML = `
    <div class="landing-modal__overlay"></div>
    <div class="landing-modal__content landing-modal__content--case-study">
      <button class="landing-modal__close">&times;</button>

      <div class="case-study">
        <div class="case-study__hero">
          <img src="${character.image_url}" alt="${character.name}" class="case-study__image">
          <div class="case-study__intro">
            <h2 class="case-study__name">${character.name}</h2>
            <p class="case-study__handle">${character.handle || ''}</p>
            <div class="case-study__metrics">
              ${metrics.map(m => `
                <div class="case-study__metric">
                  <span class="case-study__metric-icon">${m.icon}</span>
                  <span class="case-study__metric-value">${m.value}</span>
                  <span class="case-study__metric-label">${m.label}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="case-study__story">
          <h3>The Journey</h3>
          <p>${character.long_description || 'This creator built a successful AI character business using Vixxxen. Starting from zero, they grew their audience organically on Instagram and converted followers into paying subscribers on Fanvue.'}</p>

          <h3>Key to Success</h3>
          <ul>
            <li>Consistent character identity across all content</li>
            <li>Daily posting schedule with varied content types</li>
            <li>Strategic use of stories and reels for engagement</li>
            <li>Clear call-to-actions driving to paid platform</li>
          </ul>
        </div>

        <div class="case-study__cta">
          <p>Ready to build your own success story?</p>
          <button class="landing-btn landing-btn--primary case-study__cta-btn">
            Start Your Journey
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Attach event listeners
  modal.querySelector('.landing-modal__overlay').addEventListener('click', closeCaseStudyModal);
  modal.querySelector('.landing-modal__close').addEventListener('click', closeCaseStudyModal);
  modal.querySelector('.case-study__cta-btn').addEventListener('click', function() {
    closeCaseStudyModal();
    if (typeof window.showOnboardingWizard === 'function') {
      window.showOnboardingWizard();
    }
  });

  // Prevent body scroll
  document.body.style.overflow = 'hidden';

  // Animate in
  requestAnimationFrame(() => {
    modal.classList.add('landing-modal--active');
  });
}

/**
 * Close the case study modal
 */
function closeCaseStudyModal() {
  const modal = document.getElementById('caseStudyModal');
  if (modal) {
    modal.classList.remove('landing-modal--active');
    setTimeout(() => {
      modal.remove();
      // Restore body scroll for landing page
      document.body.style.overflow = 'auto';
    }, 300);
  }
}

/**
 * Open course preview modal
 */
function openCoursePreview() {
  // Remove existing modal if any
  document.getElementById('coursePreviewModal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'coursePreviewModal';
  modal.className = 'landing-modal';
  modal.innerHTML = `
    <div class="landing-modal__overlay"></div>
    <div class="landing-modal__content landing-modal__content--courses">
      <button class="landing-modal__close">&times;</button>

      <div class="course-preview">
        <div class="course-preview__header">
          <h2>Learn the Business</h2>
          <p>Step-by-step courses to build your AI creator empire</p>
        </div>

        <div class="course-preview__modules">
          <div class="course-preview__module">
            <div class="course-preview__module-icon">📱</div>
            <div class="course-preview__module-content">
              <h4>Module 1: Launch Your AI Instagram</h4>
              <p>Set up your character's Instagram presence, optimize your bio, and create your first week of content.</p>
              <span class="course-preview__module-meta">8 lessons • 45 min</span>
            </div>
          </div>

          <div class="course-preview__module">
            <div class="course-preview__module-icon">📈</div>
            <div class="course-preview__module-content">
              <h4>Module 2: Content Strategy That Converts</h4>
              <p>Learn the content mix that drives engagement and converts followers into paying subscribers.</p>
              <span class="course-preview__module-meta">12 lessons • 1.5 hrs</span>
            </div>
          </div>

          <div class="course-preview__module">
            <div class="course-preview__module-icon">💰</div>
            <div class="course-preview__module-content">
              <h4>Module 3: Fanvue Monetization Mastery</h4>
              <p>Set up your Fanvue account, price your tiers, and create content that keeps subscribers paying.</p>
              <span class="course-preview__module-meta">10 lessons • 1 hr</span>
            </div>
          </div>

          <div class="course-preview__module">
            <div class="course-preview__module-icon">🚀</div>
            <div class="course-preview__module-content">
              <h4>Module 4: Scaling to $10K/Month</h4>
              <p>Advanced strategies for growing multiple characters and building a sustainable income stream.</p>
              <span class="course-preview__module-meta">15 lessons • 2 hrs</span>
            </div>
          </div>
        </div>

        <div class="course-preview__cta">
          <p>Get full access to all courses and mentorship</p>
          <button class="landing-btn landing-btn--primary course-preview__cta-btn">
            Unlock Full Access
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Attach event listeners
  modal.querySelector('.landing-modal__overlay').addEventListener('click', closeCoursePreview);
  modal.querySelector('.landing-modal__close').addEventListener('click', closeCoursePreview);
  modal.querySelector('.course-preview__cta-btn').addEventListener('click', function() {
    closeCoursePreview();
    if (typeof window.showOnboardingWizard === 'function') {
      window.showOnboardingWizard();
    }
  });

  // Prevent body scroll
  document.body.style.overflow = 'hidden';

  // Animate in
  requestAnimationFrame(() => {
    modal.classList.add('landing-modal--active');
  });
}

/**
 * Close the course preview modal
 */
function closeCoursePreview() {
  const modal = document.getElementById('coursePreviewModal');
  if (modal) {
    modal.classList.remove('landing-modal--active');
    setTimeout(() => {
      modal.remove();
      // Restore body scroll for landing page
      document.body.style.overflow = 'auto';
    }, 300);
  }
}

// ===========================================
// COUNT-UP ANIMATION FOR STATS
// ===========================================

/**
 * Animate number count-up when stats become visible
 */
function animateStatNumbers() {
  const stats = document.querySelectorAll('.landing-stat__value');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const finalValue = el.textContent;

        // Only animate if it looks like a number
        const numMatch = finalValue.match(/[\d,]+/);
        if (numMatch) {
          const numStr = numMatch[0].replace(/,/g, '');
          const num = parseInt(numStr, 10);

          if (!isNaN(num) && num > 0) {
            animateValue(el, 0, num, 1500, finalValue);
          }
        }

        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  stats.forEach(stat => observer.observe(stat));
}

/**
 * Animate a value from start to end
 */
function animateValue(el, start, end, duration, finalText) {
  const startTime = performance.now();
  const prefix = finalText.match(/^[^\d]*/)?.[0] || '';
  const suffix = finalText.match(/[^\d]*$/)?.[0] || '';

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out cubic
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (end - start) * easeOut);

    el.textContent = prefix + current.toLocaleString() + suffix;

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = finalText; // Ensure final value is exact
    }
  }

  requestAnimationFrame(update);
}

// ===========================================
// TRIAL MODAL - "Try It Now" Feature
// ===========================================

let trialFingerprint = null;
let trialRemaining = 2;

/**
 * Initialize FingerprintJS and get browser fingerprint
 */
async function initTrialFingerprint() {
  try {
    if (typeof FingerprintJS !== 'undefined') {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      trialFingerprint = result.visitorId;
      console.log('[Trial] Fingerprint initialized');
    }
  } catch (error) {
    console.warn('[Trial] Fingerprint init failed:', error);
  }
}

/**
 * Check trial status from server
 */
async function checkTrialStatus() {
  try {
    const url = trialFingerprint
      ? `/api/trial/status?fingerprint=${encodeURIComponent(trialFingerprint)}`
      : '/api/trial/status';

    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      trialRemaining = data.remaining;
      return data;
    }
  } catch (error) {
    console.warn('[Trial] Status check failed:', error);
  }
  return { remaining: trialRemaining, canGenerate: trialRemaining > 0 };
}

/**
 * Open the trial modal
 */
async function openTrialModal() {
  // Track funnel: modal opened
  trackTrialEvent('modal_opened');

  // Initialize fingerprint if not done
  if (!trialFingerprint) {
    await initTrialFingerprint();
  }

  // Check trial status
  const status = await checkTrialStatus();

  // Remove existing modal if any
  document.getElementById('trialModal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'trialModal';
  modal.className = 'landing-modal';

  // Show exhausted state if no trials remaining
  if (status.remaining <= 0) {
    modal.innerHTML = createTrialExhaustedHTML();
  } else {
    modal.innerHTML = createTrialFormHTML(status.remaining);
  }

  document.body.appendChild(modal);
  attachTrialModalListeners(modal);

  // Prevent body scroll
  document.body.style.overflow = 'hidden';

  // Animate in
  requestAnimationFrame(() => {
    modal.classList.add('landing-modal--active');
  });
}

/**
 * Create the trial form HTML
 */
function createTrialFormHTML(remaining) {
  const remainingClass = remaining === 1 ? 'trial-modal__remaining--warning' : '';

  return `
    <div class="landing-modal__overlay"></div>
    <div class="landing-modal__content landing-modal__content--trial">
      <button class="landing-modal__close">&times;</button>

      <div class="trial-modal">
        <div class="trial-modal__header">
          <h2>Try AI Image Generation</h2>
          <p>See what you can create - no signup required</p>
        </div>

        <div class="trial-modal__character">
          <div class="trial-modal__character-image" style="background: linear-gradient(135deg, #ff2ebb 0%, #00b2ff 100%); display: flex; align-items: center; justify-content: center; font-size: 28px;">
            &#10024;
          </div>
          <div class="trial-modal__character-info">
            <div class="trial-modal__character-name">Luna - Demo Character</div>
            <div class="trial-modal__character-desc">A beautiful AI companion with silver hair and blue eyes</div>
          </div>
        </div>

        <div class="trial-modal__form" id="trialForm">
          <div class="trial-modal__input-group">
            <label for="trialPrompt">Describe your image</label>
            <textarea
              id="trialPrompt"
              class="trial-modal__textarea"
              placeholder="e.g. wearing a red dress at sunset, smiling warmly at the camera..."
              maxlength="500"
            ></textarea>
          </div>

          <div class="trial-modal__actions">
            <span class="trial-modal__remaining ${remainingClass}" id="trialRemainingText">
              ${remaining} free ${remaining === 1 ? 'try' : 'tries'} remaining
            </span>
            <button class="trial-modal__generate-btn" id="trialGenerateBtn">
              Generate
            </button>
          </div>
        </div>

        <div class="trial-modal__result" id="trialResult">
          <img src="" alt="Generated image" class="trial-modal__result-image" id="trialResultImage">
          <div class="trial-modal__result-actions">
            <button class="trial-modal__result-btn trial-modal__result-btn--try-again" id="trialTryAgainBtn">
              Try Again (<span id="trialTryAgainCount">${remaining - 1}</span> left)
            </button>
          </div>
        </div>

        <div class="trial-modal__conversion" id="trialConversion">
          <h3>Like what you see?</h3>
          <ul class="trial-modal__benefits">
            <li>20 free credits every month</li>
            <li>Choose from 50+ unique characters</li>
            <li>Access NSFW content</li>
            <li>Save and download your images</li>
          </ul>
          <button class="trial-modal__conversion-btn" id="trialSignupBtn">
            Create Free Account
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Create the exhausted state HTML
 */
function createTrialExhaustedHTML() {
  return `
    <div class="landing-modal__overlay"></div>
    <div class="landing-modal__content landing-modal__content--trial">
      <button class="landing-modal__close">&times;</button>

      <div class="trial-modal">
        <div class="trial-modal__exhausted trial-modal__exhausted--visible">
          <div class="trial-modal__exhausted-icon">&#128275;</div>
          <h3>You've used your free trials!</h3>
          <p>Create a free account to continue generating amazing AI images.</p>
          <button class="trial-modal__conversion-btn" id="trialSignupBtn">
            Create Free Account
          </button>

          <div style="margin-top: 24px;">
            <ul class="trial-modal__benefits">
              <li>20 free credits every month</li>
              <li>Choose from 50+ unique characters</li>
              <li>Access NSFW content</li>
              <li>Save and download your images</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Attach event listeners to the trial modal
 */
function attachTrialModalListeners(modal) {
  // Close button
  modal.querySelector('.landing-modal__overlay')?.addEventListener('click', closeTrialModal);
  modal.querySelector('.landing-modal__close')?.addEventListener('click', closeTrialModal);

  // Generate button
  const generateBtn = modal.querySelector('#trialGenerateBtn');
  if (generateBtn) {
    generateBtn.addEventListener('click', handleTrialGenerate);
  }

  // Try again button
  const tryAgainBtn = modal.querySelector('#trialTryAgainBtn');
  if (tryAgainBtn) {
    tryAgainBtn.addEventListener('click', handleTrialTryAgain);
  }

  // Signup button
  const signupBtn = modal.querySelector('#trialSignupBtn');
  if (signupBtn) {
    signupBtn.addEventListener('click', handleTrialSignup);
  }

  // Enter key on textarea
  const textarea = modal.querySelector('#trialPrompt');
  if (textarea) {
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleTrialGenerate();
      }
    });
  }
}

/**
 * Handle trial image generation
 */
async function handleTrialGenerate() {
  const promptInput = document.getElementById('trialPrompt');
  const generateBtn = document.getElementById('trialGenerateBtn');
  const prompt = promptInput?.value?.trim();

  if (!prompt) {
    promptInput?.focus();
    return;
  }

  // Track funnel: generation started
  trackTrialEvent('generation_started');

  // Show loading state
  generateBtn.classList.add('trial-modal__generate-btn--loading');
  generateBtn.disabled = true;

  try {
    const response = await fetch('/api/trial/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        fingerprint: trialFingerprint
      })
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 429) {
        // Rate limited or exhausted
        if (data.code === 'TRIAL_LIMIT_REACHED') {
          showTrialExhausted();
          trackTrialEvent('trial_exhausted');
        } else {
          alert(data.error || 'Please try again in a moment.');
        }
        return;
      }
      throw new Error(data.error || 'Generation failed');
    }

    // Track funnel: generation completed
    trackTrialEvent('generation_completed');

    // Update remaining count
    trialRemaining = data.remaining;

    // Show result
    showTrialResult(data.image, data.remaining);

  } catch (error) {
    console.error('[Trial] Generation error:', error);
    alert(error.message || 'Generation failed. Please try again.');
  } finally {
    generateBtn.classList.remove('trial-modal__generate-btn--loading');
    generateBtn.disabled = false;
  }
}

/**
 * Show the generated image result
 */
function showTrialResult(imageUrl, remaining) {
  const formSection = document.getElementById('trialForm');
  const resultSection = document.getElementById('trialResult');
  const resultImage = document.getElementById('trialResultImage');
  const tryAgainBtn = document.getElementById('trialTryAgainBtn');
  const tryAgainCount = document.getElementById('trialTryAgainCount');

  // Hide form, show result
  if (formSection) formSection.style.display = 'none';
  if (resultSection) resultSection.classList.add('trial-modal__result--visible');
  if (resultImage) resultImage.src = imageUrl;

  // Update try again button
  if (tryAgainCount) tryAgainCount.textContent = remaining;
  if (tryAgainBtn) {
    tryAgainBtn.disabled = remaining <= 0;
    if (remaining <= 0) {
      tryAgainBtn.textContent = 'No tries left';
    }
  }
}

/**
 * Handle try again button click
 */
function handleTrialTryAgain() {
  if (trialRemaining <= 0) {
    showTrialExhausted();
    return;
  }

  const formSection = document.getElementById('trialForm');
  const resultSection = document.getElementById('trialResult');
  const promptInput = document.getElementById('trialPrompt');
  const remainingText = document.getElementById('trialRemainingText');

  // Show form, hide result
  if (resultSection) resultSection.classList.remove('trial-modal__result--visible');
  if (formSection) formSection.style.display = 'block';

  // Update remaining text
  if (remainingText) {
    remainingText.textContent = `${trialRemaining} free ${trialRemaining === 1 ? 'try' : 'tries'} remaining`;
    remainingText.className = trialRemaining === 1
      ? 'trial-modal__remaining trial-modal__remaining--warning'
      : 'trial-modal__remaining';
  }

  // Clear and focus prompt
  if (promptInput) {
    promptInput.value = '';
    promptInput.focus();
  }
}

/**
 * Show exhausted state
 */
function showTrialExhausted() {
  const modal = document.getElementById('trialModal');
  if (!modal) return;

  const content = modal.querySelector('.landing-modal__content');
  if (content) {
    content.innerHTML = `
      <button class="landing-modal__close">&times;</button>
      <div class="trial-modal">
        <div class="trial-modal__exhausted trial-modal__exhausted--visible">
          <div class="trial-modal__exhausted-icon">&#128275;</div>
          <h3>You've used your free trials!</h3>
          <p>Create a free account to continue generating amazing AI images.</p>
          <button class="trial-modal__conversion-btn" id="trialSignupBtn">
            Create Free Account
          </button>
          <div style="margin-top: 24px;">
            <ul class="trial-modal__benefits">
              <li>20 free credits every month</li>
              <li>Choose from 50+ unique characters</li>
              <li>Access NSFW content</li>
              <li>Save and download your images</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    // Re-attach listeners
    content.querySelector('.landing-modal__close')?.addEventListener('click', closeTrialModal);
    content.querySelector('#trialSignupBtn')?.addEventListener('click', handleTrialSignup);
  }
}

/**
 * Handle signup button click
 */
function handleTrialSignup() {
  // Track funnel: signup clicked
  trackTrialEvent('signup_clicked');

  closeTrialModal();

  // Open the onboarding wizard
  if (typeof window.showOnboardingWizard === 'function') {
    window.showOnboardingWizard();
  }
}

/**
 * Close the trial modal
 */
function closeTrialModal() {
  const modal = document.getElementById('trialModal');
  if (modal) {
    modal.classList.remove('landing-modal--active');
    setTimeout(() => {
      modal.remove();
      document.body.style.overflow = 'auto';
    }, 300);
  }
}

/**
 * Track trial funnel events
 */
function trackTrialEvent(eventName, data = {}) {
  console.log(`[Trial Analytics] ${eventName}`, data);

  // Use VxAnalytics if available
  if (window.VxAnalytics) {
    switch (eventName) {
      case 'modal_opened':
        VxAnalytics.trial.started({ fingerprint: trialFingerprint, ...data });
        break;
      case 'generation_started':
        VxAnalytics.trial.generationUsed(3 - trialRemaining, { fingerprint: trialFingerprint, ...data });
        break;
      case 'generation_completed':
        VxAnalytics.track('trial_generation_completed', 'trial', { fingerprint: trialFingerprint, remaining: trialRemaining, ...data });
        break;
      case 'trial_exhausted':
        VxAnalytics.trial.completed({ fingerprint: trialFingerprint, converted: false, ...data });
        break;
      case 'signup_clicked':
        VxAnalytics.trial.converted({ fingerprint: trialFingerprint, ...data });
        break;
      default:
        VxAnalytics.track(`trial_${eventName}`, 'trial', { fingerprint: trialFingerprint, ...data });
    }
  }

  // Legacy: Also send to backend for server-side analytics
  try {
    navigator.sendBeacon('/api/trial/analytics', JSON.stringify({
      event: eventName,
      fingerprint: trialFingerprint,
      timestamp: new Date().toISOString(),
      ...data
    }));
  } catch (e) {
    // Silently fail - analytics shouldn't break UX
  }
}

// ===========================================
// EXPORT FOR GLOBAL ACCESS
// ===========================================

// Make functions available globally
window.initLandingPage = initLandingPage;
window.showLandingPage = showLandingPage;
window.hideLandingPage = hideLandingPage;
window.scrollToSection = scrollToSection;
window.openLoginModal = openLoginModal;
window.openWizardWithTier = openWizardWithTier;
window.openCharacterCaseStudy = openCharacterCaseStudy;
window.showCaseStudyModal = showCaseStudyModal;
window.closeCaseStudyModal = closeCaseStudyModal;
window.openCoursePreview = openCoursePreview;
window.closeCoursePreview = closeCoursePreview;
window.openTrialModal = openTrialModal;
window.closeTrialModal = closeTrialModal;
