// ===========================================
// ONBOARDING WIZARD
// ===========================================
// Multi-step onboarding flow for new users
// Wrapped in IIFE to avoid global scope pollution

(function(window) {
  'use strict';

  // ===========================================
  // PRIVATE STATE
  // ===========================================

  let onboardingConfig = null;
let onboardingProgress = null;
let contentPlans = [];
let educationTiers = [];
let starterCharacters = [];
let premiumCharacters = []; // Marketplace characters (unique, paid)
let currentStepIndex = 0;
let planBillingCycle = 'monthly'; // Billing cycle for creator package
let educationBillingCycle = 'monthly'; // Billing cycle for education tier
let wizardSelections = {};
let selectedStarterCharacter = null; // Track selected starter character
let purchasedPremiumCharacter = null; // Track if premium was purchased

// Placeholder starter characters (used when none in database)
const placeholderStarters = [
  { id: 'placeholder-1', name: 'Luna', category: 'Fantasy', is_starter: true },
  { id: 'placeholder-2', name: 'Aria', category: 'Modern', is_starter: true },
  { id: 'placeholder-3', name: 'Nova', category: 'Sci-Fi', is_starter: true }
];

// ===========================================
// WIZARD CONFIGURATION
// ===========================================
// These can be moved to database/API later

const WIZARD_CONFIG = {
  // Free plan option for credits step
  freePlan: {
    slug: 'free',
    name: 'Free',
    price_monthly: 0,
    price_annual: 0,
    credits_monthly: 20,
    credits_label: 'one-time credits',
    features: [
      'Try before you buy',
      'Limited features',
      'No monthly credits'
    ],
    is_free: true
  },

  // Skip option for education step
  skipEducation: {
    slug: 'none',
    name: 'Skip',
    price_monthly: 0,
    price_annual: 0,
    description: 'Go It Alone',
    features: [
      'No guided training',
      'Basic docs only',
      'Longer learning curve'
    ],
    is_skip: true
  },

  // Which plans/tiers to highlight
  popularPlanSlug: 'creator',
  proPlanSlug: 'pro',
  popularTierSlug: 'gold',
  premiumTierSlug: 'platinum',

  // Badge text
  badges: {
    popularPlan: 'Most Popular',
    proPlan: 'Best Value',
    popularTier: 'Recommended',
    premiumTier: 'Complete Package'
  },

  // Tier highlight text (fallback if not in API data)
  tierHighlights: {
    silver: 'Getting Started',
    gold: 'Most Popular',
    platinum: 'Full Mastery',
    default: 'Learn & Grow'
  }
};

// ===========================================
// REUSABLE CARD RENDERER
// ===========================================

/**
 * Renders a selection card (plan or tier)
 * @param {Object} options - Card configuration
 * @param {string} options.type - 'plan' or 'tier'
 * @param {string} options.slug - Unique identifier
 * @param {string} options.name - Display name
 * @param {number} options.priceMonthly - Monthly price
 * @param {string} options.creditsLabel - Credits text (for plans)
 * @param {number} options.creditsAmount - Credits amount (for plans)
 * @param {string} options.highlight - Highlight/tagline text (for tiers)
 * @param {Array} options.features - List of feature strings
 * @param {boolean} options.isPopular - Show popular badge
 * @param {boolean} options.isPremium - Show premium/pro badge
 * @param {string} options.popularBadgeText - Text for popular badge
 * @param {string} options.premiumBadgeText - Text for premium badge
 * @param {boolean} options.isSelected - Currently selected
 * @param {boolean} options.isFree - Is free/skip option
 * @param {Function} options.onClick - Click handler name (string)
 */
function renderSelectionCard(options) {
  const {
    type = 'plan',
    slug,
    name,
    priceMonthly = 0,
    creditsLabel,
    creditsAmount,
    highlight,
    features = [],
    isPopular = false,
    isPremium = false,
    popularBadgeText = '',
    premiumBadgeText = '',
    isSelected = false,
    isFree = false,
    onClick
  } = options;

  const cardClass = type === 'plan' ? 'plan-card' : 'tier-card';
  const freeClass = isFree ? (type === 'plan' ? 'free-plan' : 'none-tier') : '';
  const popularClass = isPopular ? 'popular' : '';
  const premiumClass = isPremium ? (type === 'plan' ? 'pro-tier' : 'premium-tier') : '';
  const selectedClass = isSelected ? 'selected' : '';

  // Build badges HTML
  let badgesHTML = '';
  if (isPopular && popularBadgeText) {
    badgesHTML += `<div class="popular-badge">${popularBadgeText}</div>`;
  }
  if (isPremium && premiumBadgeText) {
    const badgeClass = type === 'plan' ? 'pro-badge' : 'premium-badge-tag';
    badgesHTML += `<div class="${badgeClass}">${premiumBadgeText}</div>`;
  }

  // Build middle section (credits for plans, highlight for tiers)
  let middleHTML = '';
  if (type === 'plan' && (creditsAmount !== undefined || creditsLabel)) {
    middleHTML = `
      <div class="plan-credits">
        <span class="credits-amount">${creditsAmount || 0}</span>
        <span class="credits-label">${creditsLabel || 'credits/month'}</span>
      </div>
    `;
  } else if (type === 'tier' && highlight) {
    middleHTML = `
      <div class="tier-highlight">
        <span class="highlight-text">${highlight}</span>
      </div>
    `;
  }

  // Build features list
  const featuresHTML = features.length > 0
    ? `<ul class="${type}-features">${features.map(f => `<li>${f}</li>`).join('')}</ul>`
    : '';

  return `
    <div class="${cardClass} ${freeClass} ${popularClass} ${premiumClass} ${selectedClass}"
         onclick="${onClick}('${slug}')">
      ${badgesHTML}
      <div class="${type}-header">
        <h3 class="${type}-name">${name}</h3>
        <div class="${type}-price">
          <span class="price-amount">$${priceMonthly}</span>
          <span class="price-period">/mo</span>
        </div>
      </div>
      ${middleHTML}
      ${featuresHTML}
    </div>
  `;
}

// ===========================================
// INITIALIZATION & ERROR HANDLING
// ===========================================

// Track loading state and errors
let wizardLoadState = {
  isLoading: false,
  hasError: false,
  errorMessage: null,
  failedResources: []
};

/**
 * Wrapper for async API calls with error tracking
 * @param {string} resourceName - Name of the resource being loaded
 * @param {Function} loaderFn - Async function that performs the load
 * @param {*} fallback - Fallback value if load fails
 * @returns {Object} - { success, data, error }
 */
async function safeLoad(resourceName, loaderFn, fallback = null) {
  try {
    const result = await loaderFn();
    return { success: true, data: result, error: null };
  } catch (error) {
    console.error(`Error loading ${resourceName}:`, error);
    return { success: false, data: fallback, error: error.message || 'Unknown error' };
  }
}

// Load onboarding configuration from server
async function loadOnboardingConfig() {
  const response = await fetch(`${API_BASE_URL}/api/onboarding/config`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  onboardingConfig = data.steps;
  return onboardingConfig;
}

// Load content plans
async function loadContentPlans() {
  const response = await fetch(`${API_BASE_URL}/api/onboarding/content-plans`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  contentPlans = data.plans || [];
  return contentPlans;
}

// Load education tiers
async function loadEducationTiers() {
  const response = await fetch(`${API_BASE_URL}/api/onboarding/education-tiers`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  educationTiers = data.tiers || [];
  return educationTiers;
}

// Load starter characters
async function loadStarterCharacters() {
  const response = await fetch(`${API_BASE_URL}/api/onboarding/starter-characters`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  starterCharacters = data.characters || [];
  return starterCharacters;
}

// Load premium marketplace characters (non-starter, paid)
async function loadPremiumCharacters() {
  const response = await fetch(`${API_BASE_URL}/api/characters`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  // Filter to only paid characters (not starters)
  premiumCharacters = (data.characters || []).filter(c => !c.is_starter && c.price > 0);
  return premiumCharacters;
}

// Load user's onboarding progress (if logged in)
async function loadOnboardingProgress() {
  const response = await authFetch(`${API_BASE_URL}/api/onboarding/progress`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  onboardingProgress = data.progress;
  return onboardingProgress;
}

// Initialize all onboarding data with error tracking
async function initializeOnboarding() {
  wizardLoadState = {
    isLoading: true,
    hasError: false,
    errorMessage: null,
    failedResources: []
  };

  // Load all resources in parallel with error tracking
  const results = await Promise.all([
    safeLoad('config', loadOnboardingConfig, null),
    safeLoad('plans', loadContentPlans, []),
    safeLoad('tiers', loadEducationTiers, []),
    safeLoad('starters', loadStarterCharacters, []),
    safeLoad('premium', loadPremiumCharacters, [])
  ]);

  // Track which resources failed
  const resourceNames = ['config', 'plans', 'tiers', 'starters', 'premium'];
  const failedResources = [];

  results.forEach((result, index) => {
    if (!result.success) {
      failedResources.push(resourceNames[index]);
    }
  });

  wizardLoadState.isLoading = false;
  wizardLoadState.failedResources = failedResources;

  // Config is critical - if it fails, the wizard can't work
  if (!results[0].success) {
    wizardLoadState.hasError = true;
    wizardLoadState.errorMessage = 'Could not load wizard configuration. Please check your connection.';
    throw new Error(wizardLoadState.errorMessage);
  }

  // Plans and tiers are important but we can show partial UI
  if (failedResources.length > 0) {
    console.warn('Some resources failed to load:', failedResources);
  }

  return { success: true, failedResources };
}

// ===========================================
// WIZARD UI
// ===========================================

// LocalStorage key for wizard state
const WIZARD_STORAGE_KEY = 'vixxxen_wizard_state';

// Save wizard state to localStorage
function saveWizardState() {
  const state = {
    currentStepIndex,
    wizardSelections,
    planBillingCycle,
    educationBillingCycle,
    selectedStarterCharacter,
    purchasedPremiumCharacter,
    timestamp: Date.now()
  };
  try {
    localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save wizard state:', e);
  }
}

// Load wizard state from localStorage
function loadWizardState() {
  try {
    const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
    if (!saved) return null;

    const state = JSON.parse(saved);

    // Expire after 24 hours
    const ONE_DAY = 24 * 60 * 60 * 1000;
    if (Date.now() - state.timestamp > ONE_DAY) {
      clearWizardState();
      return null;
    }

    return state;
  } catch (e) {
    console.warn('Could not load wizard state:', e);
    return null;
  }
}

// Clear wizard state from localStorage
function clearWizardState() {
  try {
    localStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch (e) {
    console.warn('Could not clear wizard state:', e);
  }
}

// Show the onboarding wizard modal
function showOnboardingWizard(startAtStep = null) {
  // Create modal if it doesn't exist
  let modal = document.getElementById('onboardingWizardModal');
  if (!modal) {
    modal = createWizardModal();
    document.body.appendChild(modal);
  }

  // Try to restore previous state
  const savedState = loadWizardState();

  if (savedState && savedState.currentStepIndex > -1) {
    // Restore previous progress
    currentStepIndex = savedState.currentStepIndex;
    wizardSelections = savedState.wizardSelections || {};
    planBillingCycle = savedState.planBillingCycle || 'monthly';
    educationBillingCycle = savedState.educationBillingCycle || 'monthly';
    selectedStarterCharacter = savedState.selectedStarterCharacter || null;
    purchasedPremiumCharacter = savedState.purchasedPremiumCharacter || null;
  } else {
    // Fresh start
    currentStepIndex = -1; // -1 = intro step
    wizardSelections = {};
    planBillingCycle = 'monthly';
    educationBillingCycle = 'monthly';
    selectedStarterCharacter = null;
    purchasedPremiumCharacter = null;
  }

  // Render current step
  renderCurrentStep();

  // Show modal
  modal.classList.add('active');
}

// Hide the onboarding wizard
function hideOnboardingWizard() {
  const modal = document.getElementById('onboardingWizardModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// Create the wizard modal structure
function createWizardModal() {
  const modal = document.createElement('div');
  modal.id = 'onboardingWizardModal';
  modal.className = 'onboarding-wizard-modal';
  modal.innerHTML = `
    <div class="onboarding-wizard-overlay" onclick="hideOnboardingWizard()"></div>
    <div class="onboarding-wizard-container">
      <div class="onboarding-wizard-progress" id="wizardProgress"></div>
      <div class="onboarding-wizard-content" id="wizardContent"></div>
      <div class="onboarding-wizard-actions" id="wizardActions"></div>
    </div>
  `;
  return modal;
}

// Render progress dots
function renderProgressDots() {
  const progressEl = document.getElementById('wizardProgress');
  if (!progressEl) return;

  // Intro step doesn't show progress dots
  if (currentStepIndex === -1) {
    progressEl.innerHTML = '';
    return;
  }

  if (!onboardingConfig) return;

  // Get step labels for the progress bar
  const stepLabels = {
    'create_account': 'Account',
    'choose_character': 'Character',
    'choose_plan': 'Credits',
    'choose_education': 'Education',
    'welcome': 'Review'
  };

  const dots = onboardingConfig.map((step, idx) => {
    let className = 'progress-dot';
    const isCompleted = idx < currentStepIndex;
    const isActive = idx === currentStepIndex;
    if (isCompleted) className += ' completed clickable';
    if (isActive) className += ' active';
    const label = stepLabels[step.step_key] || `Step ${idx + 1}`;
    return `
      <div class="progress-step ${isCompleted ? 'clickable' : ''}" ${isCompleted ? `onclick="goToStep(${idx})"` : ''}>
        <div class="${className}" data-step="${idx}"></div>
        <span class="progress-step-label">${label}</span>
      </div>
    `;
  }).join('');

  progressEl.innerHTML = `
    <div class="progress-dots">${dots}</div>
    <div class="progress-hint">Click any completed step to go back and make changes</div>
  `;
}

// Go to a specific step
function goToStep(stepIndex) {
  if (stepIndex >= 0 && stepIndex < currentStepIndex) {
    currentStepIndex = stepIndex;
    renderCurrentStep();
  }
}

// Render loading state
function renderLoadingStep() {
  const contentEl = document.getElementById('wizardContent');
  const actionsEl = document.getElementById('wizardActions');
  const progressEl = document.getElementById('wizardProgress');

  if (progressEl) progressEl.innerHTML = '';

  if (contentEl) {
    contentEl.innerHTML = `
      <div class="wizard-step loading-step">
        <div class="wizard-loading-spinner"></div>
        <p class="wizard-loading-text">Loading...</p>
      </div>
    `;
  }

  if (actionsEl) actionsEl.innerHTML = '';
}

// Render error state
function renderErrorStep(errorMessage) {
  const contentEl = document.getElementById('wizardContent');
  const actionsEl = document.getElementById('wizardActions');
  const progressEl = document.getElementById('wizardProgress');

  if (progressEl) progressEl.innerHTML = '';

  if (contentEl) {
    contentEl.innerHTML = `
      <div class="wizard-step error-step">
        <div class="wizard-icon error-icon">⚠️</div>
        <h2 class="wizard-title">Something went wrong</h2>
        <p class="wizard-subtitle">${errorMessage || 'Unable to load. Please try again.'}</p>
      </div>
    `;
  }

  if (actionsEl) {
    actionsEl.innerHTML = `
      <div class="wizard-actions-row">
        <button class="wizard-btn secondary" onclick="hideOnboardingWizard()">Close</button>
        <button class="wizard-btn primary" onclick="retryWizardLoad()">Try Again</button>
      </div>
    `;
  }
}

// Retry loading wizard data
async function retryWizardLoad() {
  renderLoadingStep();
  try {
    await initializeOnboarding();
    renderCurrentStep();
  } catch (error) {
    // Use tracked error message if available
    const errorMessage = wizardLoadState.errorMessage ||
                         'Failed to load configuration. Please check your connection.';
    renderErrorStep(errorMessage);
  }
}

// Render current step content
function renderCurrentStep() {
  // Show loading if config not ready
  if (!onboardingConfig && currentStepIndex !== -1) {
    renderLoadingStep();
    return;
  }

  // Handle intro step (index -1)
  if (currentStepIndex === -1) {
    renderProgressDots();
    renderIntroStep();
    return;
  }

  if (!onboardingConfig || currentStepIndex >= onboardingConfig.length) {
    hideOnboardingWizard();
    return;
  }

  const step = onboardingConfig[currentStepIndex];
  renderProgressDots();

  switch (step.step_key) {
    case 'create_account':
      renderCreateAccountStep(step);
      break;
    case 'choose_character':
      renderChooseCharacterStep(step);
      break;
    case 'choose_plan':
      renderChoosePlanStep(step);
      break;
    case 'choose_education':
      renderChooseEducationStep(step);
      break;
    case 'welcome':
      renderWelcomeStep(step);
      break;
    default:
      renderGenericStep(step);
  }
}

// ===========================================
// STEP RENDERERS
// ===========================================

// Intro Step: Explain the process
function renderIntroStep() {
  const contentEl = document.getElementById('wizardContent');
  const actionsEl = document.getElementById('wizardActions');

  contentEl.innerHTML = `
    <div class="wizard-step intro-step">
      <div class="wizard-icon">&#127775;</div>
      <h2 class="wizard-title">Welcome to Vixxxen</h2>
      <p class="wizard-subtitle">Your AI-powered content creation platform</p>

      <div class="intro-process">
        <h3 class="process-title">Here's how it works:</h3>

        <div class="process-steps">
          <div class="process-step">
            <div class="step-number">1</div>
            <div class="step-content">
              <h4>Choose Your Character</h4>
              <p>Pick a free starter character or purchase a premium exclusive character that's 100% yours.</p>
            </div>
          </div>

          <div class="process-step">
            <div class="step-number">2</div>
            <div class="step-content">
              <h4>Select Your Creator Package</h4>
              <p>Choose the credits and features that fit your content creation goals.</p>
            </div>
          </div>

          <div class="process-step">
            <div class="step-number">3</div>
            <div class="step-content">
              <h4>Pick Your Education Level</h4>
              <p>Get training and resources to help you succeed with your new AI influencer.</p>
            </div>
          </div>
        </div>

        <div class="intro-bonus">
          <span class="bonus-icon">&#127873;</span>
          <span class="bonus-text">Start with <strong>20 free credits</strong> to try it out!</span>
        </div>
      </div>
    </div>
  `;

  actionsEl.innerHTML = `
    <button class="wizard-btn primary large" onclick="nextStep()">
      Let's Get Started
    </button>
    <p class="wizard-login-link">Already have an account? <a href="#" onclick="switchToLogin(); return false;">Sign in</a></p>
  `;
}

// Step 1: Create Account
function renderCreateAccountStep(step) {
  const contentEl = document.getElementById('wizardContent');
  const actionsEl = document.getElementById('wizardActions');
  const creditsBonus = step.config?.credits_bonus || 20;

  contentEl.innerHTML = `
    <div class="wizard-step create-account-step">
      <div class="wizard-icon">&#127881;</div>
      <h2 class="wizard-title">${step.title}</h2>
      <p class="wizard-subtitle">${step.subtitle}</p>

      <div class="wizard-bonus-badge">
        <span class="bonus-amount">${creditsBonus}</span>
        <span class="bonus-label">Free Credits</span>
      </div>

      <div class="wizard-form">
        <input type="email" class="wizard-input" id="wizardEmail" placeholder="Email address" autocomplete="email">
        <input type="password" class="wizard-input" id="wizardPassword" placeholder="Password (min 6 characters)" autocomplete="new-password">
        <div class="wizard-error" id="wizardError" style="display: none;"></div>
      </div>
    </div>
  `;

  actionsEl.innerHTML = `
    <div class="wizard-actions-row">
      <button class="wizard-btn back" onclick="prevStep()">Back</button>
      <button class="wizard-btn primary" onclick="handleCreateAccount()">
        ${step.continue_button_text || 'Create Account'}
      </button>
    </div>
    <p class="wizard-login-link">Already have an account? <a href="#" onclick="switchToLogin(); return false;">Sign in</a></p>
  `;
}

// Step 2: Choose Character
function renderChooseCharacterStep(step) {
  const contentEl = document.getElementById('wizardContent');
  const actionsEl = document.getElementById('wizardActions');

  // Color palette for character placeholders
  const placeholderColors = ['#ff2ebb', '#00b2ff', '#00cc88', '#9966ff', '#ff6600'];

  // Use placeholder starters if no real ones exist
  const displayStarters = starterCharacters.length > 0 ? starterCharacters : placeholderStarters;

  // Render free starter characters (selectable)
  const starterHTML = displayStarters.map((char, idx) => {
    const bgColor = placeholderColors[idx % placeholderColors.length];
    const isSelected = selectedStarterCharacter === char.id;
    return `
    <div class="starter-character-card free-character ${isSelected ? 'selected' : ''}"
         onclick="selectStarterCharacter('${char.id}')">
      <div class="selection-indicator">${isSelected ? '✓' : ''}</div>
      <div class="character-image">
        ${char.image_url
          ? `<img src="${char.image_url}" alt="${char.name}">`
          : `<div class="character-placeholder" style="background: linear-gradient(135deg, ${bgColor}, ${bgColor}dd);">
              <span class="placeholder-icon">✨</span>
              <span class="placeholder-name">${char.name}</span>
            </div>`}
      </div>
      <div class="character-info">
        <h3 class="character-name">${char.name}</h3>
        <p class="character-category">${char.category || ''}</p>
        <span class="character-badge free-badge">Free</span>
      </div>
    </div>
  `}).join('');

  // Render premium marketplace characters (limit to 6 for display)
  const premiumToShow = premiumCharacters.slice(0, 6);
  const premiumHTML = premiumToShow.map((char, idx) => {
    const bgColor = placeholderColors[(idx + 2) % placeholderColors.length];
    const isPurchased = purchasedPremiumCharacter === char.id;
    return `
    <div class="starter-character-card premium-character ${isPurchased ? 'purchased' : ''}"
         onclick="selectPremiumCharacter('${char.id}')">
      ${isPurchased ? '<div class="selection-indicator purchased-indicator">✓ Owned</div>' : ''}
      <div class="character-image">
        ${char.image_url
          ? `<img src="${char.image_url}" alt="${char.name}">`
          : `<div class="character-placeholder" style="background: linear-gradient(135deg, ${bgColor}, ${bgColor}dd);">
              <span class="placeholder-icon">✨</span>
              <span class="placeholder-name">${char.name}</span>
            </div>`}
      </div>
      <div class="character-info">
        <h3 class="character-name">${char.name}</h3>
        <p class="character-category">${char.category || ''}</p>
        <span class="character-badge premium-badge">$${char.price}</span>
      </div>
    </div>
  `}).join('');

  const morePremiumCount = premiumCharacters.length - premiumToShow.length;
  const hasSelection = selectedStarterCharacter || purchasedPremiumCharacter;

  contentEl.innerHTML = `
    <div class="wizard-step choose-character-step">
      <div class="wizard-icon">&#129302;</div>
      <h2 class="wizard-title">${step.title || 'Choose Your Character'}</h2>
      <p class="wizard-subtitle">${step.subtitle || 'Select a character to create content with'}</p>

      <p class="selection-requirement ${hasSelection ? 'fulfilled' : ''}">
        ${hasSelection
          ? '✓ Character selected! You can continue.'
          : 'Please select at least one character to continue'}
      </p>

      <!-- Free Characters Section -->
      <div class="character-section">
        <div class="section-header">
          <h3 class="section-title">Free Starter Characters</h3>
          <p class="section-desc">Shared characters available to all users. <strong>SFW content only.</strong> Click to select.</p>
        </div>
        <div class="starter-characters-grid">
          ${starterHTML}
        </div>
      </div>

      <!-- Premium Characters Section -->
      <div class="character-section premium-section">
        <div class="section-header">
          <h3 class="section-title">Premium Exclusive Characters</h3>
          <p class="section-desc">
            <strong>100% unique</strong> - each character is sold only once.
            Full <strong>SFW + NSFW</strong> content capabilities.
            When you buy, it's <strong>yours alone</strong>.
          </p>
        </div>
        ${premiumCharacters.length > 0 ? `
          <div class="starter-characters-grid premium-grid">
            ${premiumHTML}
          </div>
          ${morePremiumCount > 0 ? `
            <p class="more-characters-hint">
              + ${morePremiumCount} more exclusive characters in the marketplace
            </p>
          ` : ''}
        ` : '<p class="no-characters">Check back soon for exclusive characters!</p>'}
      </div>

      <p class="wizard-flexibility-note">
        You can always purchase a premium character later from the marketplace.
      </p>
    </div>
  `;

  actionsEl.innerHTML = `
    <div class="wizard-actions-row">
      <button class="wizard-btn back" onclick="prevStep()">Back</button>
      <button class="wizard-btn primary ${!hasSelection ? 'disabled' : ''}"
              onclick="handleCharacterContinue()"
              ${!hasSelection ? 'disabled' : ''}>
        Continue
      </button>
    </div>
  `;
}

// Select a free starter character
function selectStarterCharacter(characterId) {
  // Toggle selection - if already selected, deselect
  if (selectedStarterCharacter === characterId) {
    selectedStarterCharacter = null;
    wizardSelections.starter_character = null;
  } else {
    selectedStarterCharacter = characterId;
    wizardSelections.starter_character = characterId;
    // Clear premium selection when selecting starter (one or the other)
    purchasedPremiumCharacter = null;
    wizardSelections.premium_character = null;
  }
  saveWizardState();
  renderCurrentStep();
}

// Handle premium character selection in wizard (just select, pay at end)
function selectPremiumCharacter(characterId) {
  const char = premiumCharacters.find(c => c.id === characterId);
  if (!char) return;

  // Toggle selection - if already selected, deselect
  if (purchasedPremiumCharacter === characterId) {
    purchasedPremiumCharacter = null;
    wizardSelections.premium_character = null;
  } else {
    // Select this premium character (will be charged at checkout)
    purchasedPremiumCharacter = characterId;
    wizardSelections.premium_character = characterId;
    // Clear starter selection when selecting premium
    selectedStarterCharacter = null;
    wizardSelections.starter_character = null;
  }
  saveWizardState();
  renderCurrentStep();
}

// Handle continue from character step
function handleCharacterContinue() {
  if (!selectedStarterCharacter && !purchasedPremiumCharacter) {
    alert('Please select at least one character to continue.');
    return;
  }

  // Save selection
  wizardSelections.starter_character = selectedStarterCharacter;
  if (purchasedPremiumCharacter) {
    wizardSelections.premium_character = purchasedPremiumCharacter;
  }

  nextStep();
}

// Step 3: Choose Plan
function renderChoosePlanStep(step) {
  const contentEl = document.getElementById('wizardContent');
  const actionsEl = document.getElementById('wizardActions');

  // Use config for highlighting
  const { popularPlanSlug, proPlanSlug, badges, freePlan } = WIZARD_CONFIG;

  const plansHTML = contentPlans.map(plan => {
    return renderSelectionCard({
      type: 'plan',
      slug: plan.slug,
      name: plan.name,
      priceMonthly: plan.price_monthly,
      creditsAmount: plan.credits_monthly,
      creditsLabel: 'credits/month',
      features: plan.features || [],
      isPopular: plan.slug === popularPlanSlug,
      isPremium: plan.slug === proPlanSlug,
      popularBadgeText: badges.popularPlan,
      premiumBadgeText: badges.proPlan,
      isSelected: wizardSelections.content_plan === plan.slug,
      onClick: 'selectContentPlan'
    });
  }).join('');

  // Free plan card from config - at the end, smaller/less prominent
  const freePlanHTML = renderSelectionCard({
    type: 'plan',
    slug: freePlan.slug,
    name: freePlan.name,
    priceMonthly: freePlan.price_monthly,
    creditsAmount: freePlan.credits_monthly,
    creditsLabel: freePlan.credits_label,
    features: freePlan.features,
    isSelected: wizardSelections.content_plan === freePlan.slug,
    isFree: true,
    onClick: 'selectContentPlan'
  });

  contentEl.innerHTML = `
    <div class="wizard-step choose-plan-step">
      <h2 class="wizard-title">${step.title || 'Choose Your Creator Package'}</h2>
      <p class="wizard-subtitle">${step.subtitle || 'Unlock your creative potential with the right plan'}</p>

      <div class="plans-grid">
        ${plansHTML || ''}
        ${freePlanHTML}
      </div>

      <p class="wizard-flexibility-note">
        You can upgrade or change your plan anytime from your account settings.
      </p>
    </div>
  `;

  actionsEl.innerHTML = `
    <div class="wizard-actions-row">
      <button class="wizard-btn back" onclick="prevStep()">Back</button>
      <button class="wizard-btn primary" onclick="nextStep()">
        Continue
      </button>
    </div>
  `;
}

// Step 4: Choose Education
function renderChooseEducationStep(step) {
  const contentEl = document.getElementById('wizardContent');
  const actionsEl = document.getElementById('wizardActions');

  // Use config for highlighting
  const { popularTierSlug, premiumTierSlug, badges, skipEducation } = WIZARD_CONFIG;

  const tiersHTML = educationTiers.map(tier => {
    return renderSelectionCard({
      type: 'tier',
      slug: tier.slug,
      name: tier.name,
      priceMonthly: tier.price_monthly,
      highlight: tier.description || getTierHighlight(tier.slug),
      features: tier.features || [],
      isPopular: tier.slug === popularTierSlug,
      isPremium: tier.slug === premiumTierSlug,
      popularBadgeText: badges.popularTier,
      premiumBadgeText: badges.premiumTier,
      isSelected: wizardSelections.education_tier === tier.slug,
      onClick: 'selectEducationTier'
    });
  }).join('');

  // Skip option card from config - at the end, less prominent
  const noneTierHTML = renderSelectionCard({
    type: 'tier',
    slug: skipEducation.slug,
    name: skipEducation.name,
    priceMonthly: skipEducation.price_monthly,
    highlight: skipEducation.description,
    features: skipEducation.features,
    isSelected: wizardSelections.education_tier === skipEducation.slug,
    isFree: true,
    onClick: 'selectEducationTier'
  });

  contentEl.innerHTML = `
    <div class="wizard-step choose-education-step">
      <h2 class="wizard-title">${step.title || 'Accelerate Your Success'}</h2>
      <p class="wizard-subtitle">${step.subtitle || 'Creators with training earn 3x more in their first month'}</p>

      <div class="tiers-grid">
        ${tiersHTML || ''}
        ${noneTierHTML}
      </div>

      <p class="wizard-flexibility-note">
        You can add education anytime from the Learn tab.
      </p>
    </div>
  `;

  actionsEl.innerHTML = `
    <div class="wizard-actions-row">
      <button class="wizard-btn back" onclick="prevStep()">Back</button>
      <button class="wizard-btn primary" onclick="nextStep()">
        Continue to Review
      </button>
    </div>
  `;
}

// Step 5: Review & Checkout
function renderWelcomeStep(step) {
  const contentEl = document.getElementById('wizardContent');
  const actionsEl = document.getElementById('wizardActions');

  // Get selected items for pricing
  const selectedPlan = wizardSelections.content_plan
    ? contentPlans.find(p => p.slug === wizardSelections.content_plan)
    : null;
  const selectedTier = wizardSelections.education_tier
    ? educationTiers.find(t => t.slug === wizardSelections.education_tier)
    : null;
  const selectedPremiumChar = wizardSelections.premium_character
    ? premiumCharacters.find(c => c.id === wizardSelections.premium_character)
    : null;

  // Get selected starter character name
  const displayStarters = starterCharacters.length > 0 ? starterCharacters : placeholderStarters;
  const selectedStarterChar = wizardSelections.starter_character
    ? displayStarters.find(c => c.id === wizardSelections.starter_character)
    : null;

  // Calculate prices based on individual billing cycles
  const planMonthly = selectedPlan ? parseFloat(selectedPlan.price_monthly) : 0;
  const planAnnual = selectedPlan ? parseFloat(selectedPlan.price_annual) : 0;
  const planAnnualSavings = selectedPlan ? (planMonthly * 12) - planAnnual : 0;
  const planPrice = planBillingCycle === 'annual' ? planAnnual : planMonthly;
  const planMonthlyEquiv = planBillingCycle === 'annual' ? (planAnnual / 12) : planMonthly;

  const tierMonthly = selectedTier ? parseFloat(selectedTier.price_monthly) : 0;
  const tierAnnual = selectedTier ? parseFloat(selectedTier.price_annual) : 0;
  const tierAnnualSavings = selectedTier ? (tierMonthly * 12) - tierAnnual : 0;
  const tierPrice = educationBillingCycle === 'annual' ? tierAnnual : tierMonthly;
  const tierMonthlyEquiv = educationBillingCycle === 'annual' ? (tierAnnual / 12) : tierMonthly;

  // Premium character is one-time, no discount
  const premiumCharPrice = selectedPremiumChar ? parseFloat(selectedPremiumChar.price) : 0;

  // Calculate total due today
  const totalDueToday = premiumCharPrice + planPrice + tierPrice;
  const hasRecurring = planMonthly > 0 || tierMonthly > 0;
  const hasPaidItems = totalDueToday > 0;

  contentEl.innerHTML = `
    <div class="wizard-step review-step">
      <div class="wizard-icon">&#128203;</div>
      <h2 class="wizard-title">Review Your Selections</h2>
      <p class="wizard-subtitle">Here's what you've chosen. You can go back to any step to make changes.</p>

      <div class="review-sections">
        <!-- Character Selection -->
        <div class="review-section">
          <div class="review-section-header">
            <h4>Character</h4>
            <button class="review-edit-btn" onclick="goToStep(1)">Edit</button>
          </div>
          <div class="review-section-content">
            ${selectedPremiumChar ? `
              <div class="review-item premium">
                <span class="item-name">${selectedPremiumChar.name}</span>
                <span class="item-badge premium">Premium Exclusive</span>
                <span class="item-price">$${premiumCharPrice.toFixed(2)} <small>(one-time)</small></span>
              </div>
            ` : selectedStarterChar ? `
              <div class="review-item free">
                <span class="item-name">${selectedStarterChar.name}</span>
                <span class="item-badge free">Free Starter</span>
                <span class="item-price">$0</span>
              </div>
            ` : `
              <div class="review-item none">
                <span class="item-name">No character selected</span>
              </div>
            `}
          </div>
        </div>

        <!-- Creator Package -->
        <div class="review-section">
          <div class="review-section-header">
            <h4>Creator Package</h4>
            <button class="review-edit-btn" onclick="goToStep(2)">Edit</button>
          </div>
          <div class="review-section-content">
            ${selectedPlan ? `
              <div class="review-item-with-toggle">
                <div class="review-item">
                  <span class="item-name">${selectedPlan.name}</span>
                  <span class="item-detail">${selectedPlan.credits_monthly} credits/month</span>
                </div>
                <div class="item-billing">
                  <div class="billing-toggle mini-toggle">
                    <button class="toggle-btn ${planBillingCycle === 'monthly' ? 'active' : ''}" onclick="setBillingCycle('plan', 'monthly')">Monthly</button>
                    <button class="toggle-btn ${planBillingCycle === 'annual' ? 'active' : ''}" onclick="setBillingCycle('plan', 'annual')">
                      Annual ${planAnnualSavings > 0 ? `<span class="save-badge">-$${planAnnualSavings.toFixed(0)}</span>` : ''}
                    </button>
                  </div>
                  <span class="item-price">
                    ${planBillingCycle === 'annual'
                      ? `$${planMonthlyEquiv.toFixed(2)}/mo <small>($${planAnnual.toFixed(2)}/yr)</small>`
                      : `$${planMonthly.toFixed(2)}/mo`
                    }
                  </span>
                </div>
              </div>
            ` : `
              <div class="review-item free">
                <span class="item-name">Free Plan</span>
                <span class="item-detail">20 starter credits</span>
                <span class="item-price">$0</span>
              </div>
            `}
          </div>
        </div>

        <!-- Education -->
        <div class="review-section">
          <div class="review-section-header">
            <h4>Education</h4>
            <button class="review-edit-btn" onclick="goToStep(3)">Edit</button>
          </div>
          <div class="review-section-content">
            ${selectedTier ? `
              <div class="review-item-with-toggle">
                <div class="review-item">
                  <span class="item-name">${selectedTier.name}</span>
                </div>
                <div class="item-billing">
                  <div class="billing-toggle mini-toggle">
                    <button class="toggle-btn ${educationBillingCycle === 'monthly' ? 'active' : ''}" onclick="setBillingCycle('education', 'monthly')">Monthly</button>
                    <button class="toggle-btn ${educationBillingCycle === 'annual' ? 'active' : ''}" onclick="setBillingCycle('education', 'annual')">
                      Annual ${tierAnnualSavings > 0 ? `<span class="save-badge">-$${tierAnnualSavings.toFixed(0)}</span>` : ''}
                    </button>
                  </div>
                  <span class="item-price">
                    ${educationBillingCycle === 'annual'
                      ? `$${tierMonthlyEquiv.toFixed(2)}/mo <small>($${tierAnnual.toFixed(2)}/yr)</small>`
                      : `$${tierMonthly.toFixed(2)}/mo`
                    }
                  </span>
                </div>
              </div>
            ` : `
              <div class="review-item none">
                <span class="item-name">No education plan</span>
                <span class="item-price">$0</span>
              </div>
            `}
          </div>
        </div>
      </div>

      ${hasPaidItems ? `
        <!-- Pricing Summary -->
        <div class="checkout-summary">
          <h4>Payment Summary</h4>

          ${premiumCharPrice > 0 ? `
            <div class="summary-line">
              <span>${selectedPremiumChar.name} (one-time)</span>
              <span class="summary-amount">$${premiumCharPrice.toFixed(2)}</span>
            </div>
          ` : ''}

          ${selectedPlan ? `
            <div class="summary-line">
              <span>${selectedPlan.name} (${planBillingCycle})</span>
              <span class="summary-amount">$${planPrice.toFixed(2)}</span>
            </div>
          ` : ''}

          ${selectedTier ? `
            <div class="summary-line">
              <span>${selectedTier.name} (${educationBillingCycle})</span>
              <span class="summary-amount">$${tierPrice.toFixed(2)}</span>
            </div>
          ` : ''}

          <div class="summary-total">
            <span>Due today</span>
            <span class="total-amount">$${totalDueToday.toFixed(2)}</span>
          </div>

          ${hasRecurring ? `
            <p class="recurring-note">
              Subscriptions will renew ${planBillingCycle === 'annual' || educationBillingCycle === 'annual' ? 'annually or monthly based on your selections' : 'monthly'}.
            </p>
          ` : ''}
        </div>
      ` : `
        <div class="checkout-free">
          <div class="free-badge-large">&#127881; It's Free!</div>
          <p>You're starting with 20 free credits. No payment required!</p>
        </div>
      `}

      <p class="wizard-flexibility-note">
        You can upgrade your plan, add education, or purchase premium characters anytime.
      </p>
    </div>
  `;

  actionsEl.innerHTML = `
    <div class="wizard-actions-row">
      <button class="wizard-btn back" onclick="prevStep()">Back</button>
      <button class="wizard-btn primary large" onclick="handleCheckout()">
        ${hasPaidItems ? 'Complete Purchase' : 'Start Creating - It\'s Free!'}
      </button>
    </div>
  `;
}

// Handle final checkout
async function handleCheckout() {
  const hasPaidItems = wizardSelections.content_plan ||
                       wizardSelections.education_tier ||
                       wizardSelections.premium_character;

  if (hasPaidItems) {
    // TODO: Integrate with payment system (Stripe, etc.)
    alert('Payment integration coming soon! For now, enjoy exploring Vixxxen.');
  }

  await completeOnboarding();
}

// Generic step renderer for custom steps
function renderGenericStep(step) {
  const contentEl = document.getElementById('wizardContent');
  const actionsEl = document.getElementById('wizardActions');

  contentEl.innerHTML = `
    <div class="wizard-step">
      <h2 class="wizard-title">${step.title}</h2>
      <p class="wizard-subtitle">${step.subtitle || ''}</p>
    </div>
  `;

  actionsEl.innerHTML = `
    <div class="wizard-actions-row">
      <button class="wizard-btn back" onclick="prevStep()">Back</button>
      <button class="wizard-btn primary" onclick="nextStep()">
        ${step.continue_button_text || 'Continue'}
      </button>
    </div>
  `;
}

// ===========================================
// WIZARD ACTIONS
// ===========================================

// Handle account creation
async function handleCreateAccount() {
  const email = document.getElementById('wizardEmail')?.value?.trim();
  const password = document.getElementById('wizardPassword')?.value;
  const errorEl = document.getElementById('wizardError');

  // Validation
  if (!email || !password) {
    showWizardError('Please enter email and password');
    return;
  }

  if (password.length < 6) {
    showWizardError('Password must be at least 6 characters');
    return;
  }

  try {
    // Show loading state
    const btn = document.querySelector('.wizard-btn.primary');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creating account...';
    }

    // Create account using Supabase
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password
    });

    if (error) throw error;

    // Account created - the auth state change handler will update the UI
    // Move to next step
    await saveStepProgress('create_account', false, { email });
    nextStep();

  } catch (error) {
    console.error('Account creation error:', error);
    showWizardError(error.message || 'Failed to create account');

    // Reset button
    const btn = document.querySelector('.wizard-btn.primary');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  }
}

// Show wizard error message
function showWizardError(message) {
  const errorEl = document.getElementById('wizardError');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
}

// Switch to regular login modal
function switchToLogin() {
  hideOnboardingWizard();
  showLoginModal();
}

// Go to next step
function nextStep() {
  if (onboardingConfig && currentStepIndex < onboardingConfig.length - 1) {
    currentStepIndex++;
    saveWizardState();
    renderCurrentStep();
  } else {
    completeOnboarding();
  }
}

// Go to previous step
function prevStep() {
  if (currentStepIndex > -1) {
    currentStepIndex--;
    saveWizardState();
    renderCurrentStep();
  }
}

// Skip current step
async function skipStep() {
  const step = onboardingConfig[currentStepIndex];
  await saveStepProgress(step.step_key, true);
  nextStep();
}

// Set billing cycle for a specific subscription type
function setBillingCycle(type, cycle) {
  if (type === 'plan') {
    planBillingCycle = cycle;
  } else if (type === 'education') {
    educationBillingCycle = cycle;
  }
  saveWizardState();
  renderCurrentStep();
}

// Select content plan
function selectContentPlan(slug) {
  wizardSelections.content_plan = slug;
  saveWizardState();
  renderCurrentStep();
}

// Select education tier
function selectEducationTier(slug) {
  wizardSelections.education_tier = slug;
  saveWizardState();
  renderCurrentStep();
}

// Get tier highlight text based on slug
function getTierHighlight(slug) {
  const { tierHighlights } = WIZARD_CONFIG;
  return tierHighlights[slug] || tierHighlights.default;
}

// Handle plan selection (would integrate with payment)
async function handlePlanSelection() {
  const plan = contentPlans.find(p => p.slug === wizardSelections.content_plan);
  if (!plan) return;

  // TODO: Integrate with payment system
  // For now, just save selection and move on
  await saveStepProgress('choose_plan', false, {
    plan: wizardSelections.content_plan,
    billing_cycle: planBillingCycle
  });

  // Show payment modal or redirect to payment
  alert(`Payment integration coming soon!\nYou selected: ${plan.name} (${planBillingCycle})`);

  nextStep();
}

// Handle education selection (would integrate with payment)
async function handleEducationSelection() {
  const tier = educationTiers.find(t => t.slug === wizardSelections.education_tier);
  if (!tier) return;

  // TODO: Integrate with payment system
  await saveStepProgress('choose_education', false, {
    tier: wizardSelections.education_tier,
    billing_cycle: educationBillingCycle
  });

  alert(`Payment integration coming soon!\nYou selected: ${tier.name} (${educationBillingCycle})`);

  nextStep();
}

// Go to marketplace from wizard
function goToMarketplace() {
  hideOnboardingWizard();
  // Switch to marketplace tab
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.getElementById('marketplaceSection')?.classList.add('active');
}

// Save step progress to server
async function saveStepProgress(stepKey, skipped, selection = null) {
  if (!currentUser) return;

  try {
    await authFetch(`${API_BASE_URL}/api/onboarding/complete-step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step_key: stepKey,
        skipped: skipped,
        selection: selection
      })
    });
  } catch (error) {
    console.error('Error saving step progress:', error);
  }
}

// Complete the onboarding wizard
async function completeOnboarding() {
  try {
    // Mark onboarding as complete
    if (currentUser) {
      await authFetch(`${API_BASE_URL}/api/onboarding/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completed: true,
          selections: wizardSelections
        })
      });
    }

    // Clear saved wizard state on successful completion
    clearWizardState();

    // Hide wizard
    hideOnboardingWizard();

    // Navigate to image section
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    document.getElementById('imageSection')?.classList.add('active');
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.nav-tab[onclick*="imageSection"]')?.classList.add('active');

  } catch (error) {
    console.error('Error completing onboarding:', error);
    hideOnboardingWizard();
  }
}

// ===========================================
// PROMPT/REMINDER SYSTEM
// ===========================================

// Check for and show prompts
async function checkAndShowPrompts() {
  if (!currentUser) return;

  try {
    const response = await authFetch(`${API_BASE_URL}/api/onboarding/check-prompts`);
    if (!response.ok) return;

    const data = await response.json();
    if (data.prompt) {
      showPromptBanner(data.prompt);
    }
  } catch (error) {
    console.error('Error checking prompts:', error);
  }
}

// Show a prompt banner
function showPromptBanner(prompt) {
  // Remove existing banner
  document.getElementById('promptBanner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'promptBanner';
  banner.className = 'prompt-banner';
  banner.innerHTML = `
    <div class="prompt-content">
      <div class="prompt-text">
        <strong>${prompt.title}</strong>
        <span>${prompt.message}</span>
      </div>
      <div class="prompt-actions">
        <button class="prompt-cta" onclick="handlePromptCta('${prompt.trigger_key}', '${prompt.type}')">${prompt.cta}</button>
        <button class="prompt-dismiss" onclick="dismissPrompt('${prompt.trigger_key}')">&times;</button>
      </div>
    </div>
  `;

  document.body.appendChild(banner);

  // Record that prompt was shown
  authFetch(`${API_BASE_URL}/api/onboarding/prompt-shown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger_key: prompt.trigger_key })
  }).catch(console.error);

  // Auto-hide after 30 seconds
  setTimeout(() => {
    banner.classList.add('hiding');
    setTimeout(() => banner.remove(), 300);
  }, 30000);
}

// Handle prompt CTA click
async function handlePromptCta(triggerKey, promptType) {
  // Record conversion
  try {
    await authFetch(`${API_BASE_URL}/api/onboarding/prompt-converted`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger_key: triggerKey })
    });
  } catch (error) {
    console.error('Error recording conversion:', error);
  }

  // Remove banner
  document.getElementById('promptBanner')?.remove();

  // Navigate based on prompt type
  switch (promptType) {
    case 'upgrade_plan':
      openSubscriptionPage();
      break;
    case 'suggest_education':
      // Open learn tab or education selection
      document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
      document.getElementById('learnSection')?.classList.add('active');
      break;
    case 'buy_character':
      // Open marketplace
      document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
      document.getElementById('marketplaceSection')?.classList.add('active');
      break;
    default:
      console.log('Unknown prompt type:', promptType);
  }
}

// Dismiss a prompt
async function dismissPrompt(triggerKey) {
  // Record dismissal
  try {
    await authFetch(`${API_BASE_URL}/api/onboarding/prompt-dismissed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger_key: triggerKey })
    });
  } catch (error) {
    console.error('Error recording dismissal:', error);
  }

  // Remove banner
  const banner = document.getElementById('promptBanner');
  if (banner) {
    banner.classList.add('hiding');
    setTimeout(() => banner.remove(), 300);
  }
}

// ===========================================
// TRIGGER ONBOARDING ON BLOCKED ACTIONS
// ===========================================

// Call this when user tries to do something that requires login
function triggerOnboardingOrLogin(action = 'generate') {
  if (currentUser) {
    // User is logged in but maybe needs to upgrade
    // Check credits or subscription status
    if (userCredits <= 0) {
      checkAndShowPrompts();
    }
    return true; // Allow action
  }

  // User not logged in - show onboarding wizard
  // Show loading state immediately, then load data
  showOnboardingWizard('create_account');

  // If data not loaded yet, initialize in background
  if (!onboardingConfig) {
    initializeOnboarding()
      .then(() => {
        renderCurrentStep();
      })
      .catch(() => {
        // Error will be shown via wizardLoadState
        renderErrorStep(wizardLoadState.errorMessage || 'Unable to load. Please try again.');
      });
  }

  return false; // Block action
}

  // ===========================================
  // PUBLIC API
  // ===========================================
  // Expose functions needed by onclick handlers and other scripts

  // Helper to check if wizard is ready (config loaded)
  function isWizardReady() {
    return onboardingConfig !== null;
  }

  // Reset wizard state (call on logout)
  function resetWizard() {
    clearWizardState();
    currentStepIndex = -1;
    wizardSelections = {};
    planBillingCycle = 'monthly';
    educationBillingCycle = 'monthly';
    selectedStarterCharacter = null;
    purchasedPremiumCharacter = null;
  }

  // Main entry points (called from other JS files)
  window.showOnboardingWizard = showOnboardingWizard;
  window.hideOnboardingWizard = hideOnboardingWizard;
  window.triggerOnboardingOrLogin = triggerOnboardingOrLogin;
  window.initializeOnboarding = initializeOnboarding;
  window.checkAndShowPrompts = checkAndShowPrompts;
  window.isWizardReady = isWizardReady;
  window.resetWizard = resetWizard;

  // Step navigation (called from onclick in templates)
  window.nextStep = nextStep;
  window.prevStep = prevStep;
  window.goToStep = goToStep;
  window.retryWizardLoad = retryWizardLoad;

  // Form handlers (called from onclick in templates)
  window.handleCreateAccount = handleCreateAccount;
  window.switchToLogin = switchToLogin;
  window.handleCheckout = handleCheckout;

  // Character selection (called from onclick in templates)
  window.selectStarterCharacter = selectStarterCharacter;
  window.selectPremiumCharacter = selectPremiumCharacter;
  window.handleCharacterContinue = handleCharacterContinue;

  // Plan/tier selection (called from onclick in templates)
  window.selectContentPlan = selectContentPlan;
  window.selectEducationTier = selectEducationTier;
  window.setBillingCycle = setBillingCycle;

  // Prompt system (called from onclick in templates)
  window.handlePromptCta = handlePromptCta;
  window.dismissPrompt = dismissPrompt;

})(window);
