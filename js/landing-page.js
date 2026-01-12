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

    // Attach event listeners to CTA buttons (backup for onclick)
    attachLandingCTAListeners();

    console.log('🏠 Landing page initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize landing page:', error);
    // Show fallback content (already in HTML)
    renderFallbackContent();
  }
}

/**
 * Attach event listeners to landing page CTA buttons
 * This ensures the onclick handlers work even if there are scoping issues
 */
function attachLandingCTAListeners() {
  console.log('🔗 Attaching CTA listeners...');

  // Hero primary CTA - "Start Building"
  const heroCta = document.getElementById('heroPrimaryCta');
  if (heroCta) {
    heroCta.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('🚀 Hero CTA clicked via event listener');
      openLoginModal();
    });
    console.log('✅ Hero CTA listener attached');
  }

  // Final CTA - "Get Started Free"
  const finalCta = document.getElementById('finalCtaPrimary');
  if (finalCta) {
    finalCta.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('🚀 Final CTA clicked via event listener');
      openLoginModal();
    });
    console.log('✅ Final CTA listener attached');
  }

  // Education CTA - "Explore Courses"
  const educationCta = document.getElementById('educationCta');
  if (educationCta) {
    educationCta.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('🚀 Education CTA clicked via event listener');
      openCoursePreview();
    });
    console.log('✅ Education CTA listener attached');
  }
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

  if (landingPage) {
    landingPage.style.display = 'block';
  }

  // Hide main app elements
  if (topNavbar) topNavbar.style.display = 'none';
  if (container) container.style.display = 'none';
  if (mobileOverlay) mobileOverlay.style.display = 'none';
  if (siteFooter) siteFooter.style.display = 'none';

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

  if (landingPage) {
    landingPage.style.display = 'none';
  }

  // Show main app elements
  if (topNavbar) topNavbar.style.display = 'flex';
  if (container) container.style.display = 'flex';
  if (siteFooter) siteFooter.style.display = 'flex';

  // Restore body overflow for main app
  document.body.style.overflow = 'hidden';
  document.body.style.height = '100vh';
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
 * Open the onboarding wizard from landing page
 * This is the main conversion action
 */
function openLoginModal() {
  console.log('🚀 openLoginModal called, checking for wizard...');

  // Call the onboarding wizard (using window. to access the global export)
  if (typeof window.showOnboardingWizard === 'function') {
    console.log('✅ Wizard found, opening...');
    window.showOnboardingWizard();
  } else {
    console.warn('❌ Onboarding wizard not available, window.showOnboardingWizard =', window.showOnboardingWizard);
    alert('Please refresh the page and try again.');
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
    <div class="landing-modal__overlay" onclick="closeCaseStudyModal()"></div>
    <div class="landing-modal__content landing-modal__content--case-study">
      <button class="landing-modal__close" onclick="closeCaseStudyModal()">&times;</button>

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
          <button class="landing-btn landing-btn--primary" onclick="closeCaseStudyModal(); window.openLoginModal();">
            Start Your Journey
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

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
    <div class="landing-modal__overlay" onclick="closeCoursePreview()"></div>
    <div class="landing-modal__content landing-modal__content--courses">
      <button class="landing-modal__close" onclick="closeCoursePreview()">&times;</button>

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
          <button class="landing-btn landing-btn--primary" onclick="closeCoursePreview(); window.openLoginModal();">
            Unlock Full Access
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

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
