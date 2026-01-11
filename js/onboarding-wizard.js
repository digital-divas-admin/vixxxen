// ===========================================
// ONBOARDING WIZARD
// ===========================================
// Multi-step onboarding flow for new users

// State
let onboardingConfig = null;
let onboardingProgress = null;
let contentPlans = [];
let educationTiers = [];
let starterCharacters = [];
let premiumCharacters = []; // Marketplace characters (unique, paid)
let currentStepIndex = 0;
let billingCycle = 'monthly'; // or 'annual'
let wizardSelections = {};

// ===========================================
// INITIALIZATION
// ===========================================

// Load onboarding configuration from server
async function loadOnboardingConfig() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/onboarding/config`);
    if (response.ok) {
      const data = await response.json();
      onboardingConfig = data.steps;
      return onboardingConfig;
    }
  } catch (error) {
    console.error('Error loading onboarding config:', error);
  }
  return null;
}

// Load content plans
async function loadContentPlans() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/onboarding/content-plans`);
    if (response.ok) {
      const data = await response.json();
      contentPlans = data.plans;
      return contentPlans;
    }
  } catch (error) {
    console.error('Error loading content plans:', error);
  }
  return [];
}

// Load education tiers
async function loadEducationTiers() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/onboarding/education-tiers`);
    if (response.ok) {
      const data = await response.json();
      educationTiers = data.tiers;
      return educationTiers;
    }
  } catch (error) {
    console.error('Error loading education tiers:', error);
  }
  return [];
}

// Load starter characters
async function loadStarterCharacters() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/onboarding/starter-characters`);
    if (response.ok) {
      const data = await response.json();
      starterCharacters = data.characters;
      return starterCharacters;
    }
  } catch (error) {
    console.error('Error loading starter characters:', error);
  }
  return [];
}

// Load premium marketplace characters (non-starter, paid)
async function loadPremiumCharacters() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/characters`);
    if (response.ok) {
      const data = await response.json();
      // Filter to only paid characters (not starters)
      premiumCharacters = (data.characters || []).filter(c => !c.is_starter && c.price > 0);
      return premiumCharacters;
    }
  } catch (error) {
    console.error('Error loading premium characters:', error);
  }
  return [];
}

// Load user's onboarding progress (if logged in)
async function loadOnboardingProgress() {
  try {
    const response = await authFetch(`${API_BASE_URL}/api/onboarding/progress`);
    if (response.ok) {
      const data = await response.json();
      onboardingProgress = data.progress;
      return onboardingProgress;
    }
  } catch (error) {
    console.error('Error loading onboarding progress:', error);
  }
  return null;
}

// Initialize all onboarding data
async function initializeOnboarding() {
  await Promise.all([
    loadOnboardingConfig(),
    loadContentPlans(),
    loadEducationTiers(),
    loadStarterCharacters(),
    loadPremiumCharacters()
  ]);
}

// ===========================================
// WIZARD UI
// ===========================================

// Show the onboarding wizard modal
function showOnboardingWizard(startAtStep = null) {
  // Create modal if it doesn't exist
  let modal = document.getElementById('onboardingWizardModal');
  if (!modal) {
    modal = createWizardModal();
    document.body.appendChild(modal);
  }

  // Reset state
  currentStepIndex = 0;
  wizardSelections = {};
  billingCycle = 'monthly';

  // If startAtStep specified, find its index
  if (startAtStep && onboardingConfig) {
    const idx = onboardingConfig.findIndex(s => s.step_key === startAtStep);
    if (idx >= 0) currentStepIndex = idx;
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
  if (!progressEl || !onboardingConfig) return;

  const dots = onboardingConfig.map((step, idx) => {
    let className = 'progress-dot';
    if (idx < currentStepIndex) className += ' completed';
    if (idx === currentStepIndex) className += ' active';
    return `<div class="${className}" data-step="${idx}"></div>`;
  }).join('');

  progressEl.innerHTML = `
    <div class="progress-dots">${dots}</div>
    <div class="progress-label">Step ${currentStepIndex + 1} of ${onboardingConfig.length}</div>
  `;
}

// Render current step content
function renderCurrentStep() {
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
    <button class="wizard-btn primary" onclick="handleCreateAccount()">
      ${step.continue_button_text || 'Create Account'}
    </button>
    <p class="wizard-login-link">Already have an account? <a href="#" onclick="switchToLogin(); return false;">Sign in</a></p>
  `;
}

// Step 2: Choose Character
function renderChooseCharacterStep(step) {
  const contentEl = document.getElementById('wizardContent');
  const actionsEl = document.getElementById('wizardActions');

  // Color palette for character placeholders
  const placeholderColors = ['#ff2ebb', '#00b2ff', '#00cc88', '#9966ff', '#ff6600'];

  // Render free starter characters
  const starterHTML = starterCharacters.map((char, idx) => {
    const bgColor = placeholderColors[idx % placeholderColors.length];
    return `
    <div class="starter-character-card free-character">
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
    return `
    <div class="starter-character-card premium-character" onclick="selectPremiumCharacter('${char.id}')">
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

  contentEl.innerHTML = `
    <div class="wizard-step choose-character-step">
      <div class="wizard-icon">&#129302;</div>
      <h2 class="wizard-title">${step.title}</h2>
      <p class="wizard-subtitle">${step.subtitle}</p>

      <!-- Free Characters Section -->
      <div class="character-section">
        <div class="section-header">
          <h3 class="section-title">Free Starter Characters</h3>
          <p class="section-desc">Shared characters available to all users. <strong>SFW content only.</strong></p>
        </div>
        <div class="starter-characters-grid">
          ${starterHTML || '<p class="no-characters">No free characters available</p>'}
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
    </div>
  `;

  actionsEl.innerHTML = `
    <button class="wizard-btn primary" onclick="nextStep()">
      ${step.continue_button_text || 'Continue with Free Characters'}
    </button>
    ${!step.is_required ? `
      <button class="wizard-btn secondary" onclick="skipStep()">
        ${step.skip_button_text || 'Skip for now'}
      </button>
    ` : ''}
  `;
}

// Handle premium character selection in wizard
function selectPremiumCharacter(characterId) {
  const char = premiumCharacters.find(c => c.id === characterId);
  if (!char) return;

  // Store selection for potential purchase
  wizardSelections.premium_character = characterId;

  // Show purchase confirmation
  const confirmed = confirm(
    `Purchase "${char.name}" for $${char.price}?\n\n` +
    `This is an exclusive character that will be yours alone.\n` +
    `Full SFW + NSFW content capabilities included.`
  );

  if (confirmed) {
    // TODO: Integrate with payment system
    alert('Payment integration coming soon! You can purchase characters from the marketplace after signup.');
  }
}

// Step 3: Choose Plan
function renderChoosePlanStep(step) {
  const contentEl = document.getElementById('wizardContent');
  const actionsEl = document.getElementById('wizardActions');

  const plansHTML = contentPlans.map(plan => {
    const price = billingCycle === 'annual' ? plan.price_annual : plan.price_monthly;
    const monthlyEquiv = billingCycle === 'annual' ? (plan.price_annual / 12).toFixed(2) : plan.price_monthly;
    const features = plan.features || [];

    return `
      <div class="plan-card ${wizardSelections.content_plan === plan.slug ? 'selected' : ''}"
           onclick="selectContentPlan('${plan.slug}')">
        <div class="plan-header">
          <h3 class="plan-name">${plan.name}</h3>
          <div class="plan-price">
            <span class="price-amount">$${monthlyEquiv}</span>
            <span class="price-period">/mo</span>
          </div>
          ${billingCycle === 'annual' ? `<div class="plan-billed">Billed $${price}/year</div>` : ''}
        </div>
        <div class="plan-credits">
          <span class="credits-amount">${plan.credits_monthly}</span>
          <span class="credits-label">credits/month</span>
        </div>
        <ul class="plan-features">
          ${features.map(f => `<li>${f}</li>`).join('')}
        </ul>
      </div>
    `;
  }).join('');

  contentEl.innerHTML = `
    <div class="wizard-step choose-plan-step">
      <h2 class="wizard-title">${step.title}</h2>
      <p class="wizard-subtitle">${step.subtitle}</p>

      ${step.config?.show_annual_toggle ? `
        <div class="billing-toggle">
          <button class="toggle-btn ${billingCycle === 'monthly' ? 'active' : ''}" onclick="setBillingCycle('monthly')">Monthly</button>
          <button class="toggle-btn ${billingCycle === 'annual' ? 'active' : ''}" onclick="setBillingCycle('annual')">
            Annual <span class="save-badge">Save 20%</span>
          </button>
        </div>
      ` : ''}

      <div class="plans-grid">
        ${plansHTML || '<p>Loading plans...</p>'}
      </div>
    </div>
  `;

  actionsEl.innerHTML = `
    ${wizardSelections.content_plan ? `
      <button class="wizard-btn primary" onclick="handlePlanSelection()">
        Subscribe to ${wizardSelections.content_plan.charAt(0).toUpperCase() + wizardSelections.content_plan.slice(1)}
      </button>
    ` : ''}
    <button class="wizard-btn secondary" onclick="skipStep()">
      ${step.skip_button_text || 'Continue with free credits'}
    </button>
  `;
}

// Step 4: Choose Education
function renderChooseEducationStep(step) {
  const contentEl = document.getElementById('wizardContent');
  const actionsEl = document.getElementById('wizardActions');

  const tiersHTML = educationTiers.map(tier => {
    const price = billingCycle === 'annual' ? tier.price_annual : tier.price_monthly;
    const monthlyEquiv = billingCycle === 'annual' ? (tier.price_annual / 12).toFixed(2) : tier.price_monthly;
    const features = tier.features || [];

    return `
      <div class="tier-card ${wizardSelections.education_tier === tier.slug ? 'selected' : ''}"
           onclick="selectEducationTier('${tier.slug}')">
        <div class="tier-header">
          <h3 class="tier-name">${tier.name}</h3>
          <div class="tier-price">
            <span class="price-amount">$${monthlyEquiv}</span>
            <span class="price-period">/mo</span>
          </div>
          ${billingCycle === 'annual' ? `<div class="tier-billed">Billed $${price}/year</div>` : ''}
        </div>
        <p class="tier-description">${tier.description || ''}</p>
        <ul class="tier-features">
          ${features.map(f => `<li>${f}</li>`).join('')}
        </ul>
      </div>
    `;
  }).join('');

  contentEl.innerHTML = `
    <div class="wizard-step choose-education-step">
      <h2 class="wizard-title">${step.title}</h2>
      <p class="wizard-subtitle">${step.subtitle}</p>

      ${step.config?.show_annual_toggle ? `
        <div class="billing-toggle">
          <button class="toggle-btn ${billingCycle === 'monthly' ? 'active' : ''}" onclick="setBillingCycle('monthly')">Monthly</button>
          <button class="toggle-btn ${billingCycle === 'annual' ? 'active' : ''}" onclick="setBillingCycle('annual')">
            Annual <span class="save-badge">Save 20%</span>
          </button>
        </div>
      ` : ''}

      <div class="tiers-grid">
        ${tiersHTML || '<p>Loading tiers...</p>'}
      </div>
    </div>
  `;

  actionsEl.innerHTML = `
    ${wizardSelections.education_tier ? `
      <button class="wizard-btn primary" onclick="handleEducationSelection()">
        Join ${wizardSelections.education_tier.charAt(0).toUpperCase() + wizardSelections.education_tier.slice(1)}
      </button>
    ` : ''}
    <button class="wizard-btn secondary" onclick="skipStep()">
      ${step.skip_button_text || 'Skip - I just want to create'}
    </button>
  `;
}

// Step 5: Welcome
function renderWelcomeStep(step) {
  const contentEl = document.getElementById('wizardContent');
  const actionsEl = document.getElementById('wizardActions');

  // Build summary based on selections
  let summaryItems = [];
  summaryItems.push(`<li>You have <strong>${userCredits || 20} credits</strong> to start creating</li>`);

  if (starterCharacters.length > 0) {
    const charNames = starterCharacters.map(c => c.name).join(', ');
    summaryItems.push(`<li>Create with starter characters: <strong>${charNames}</strong></li>`);
  }

  if (wizardSelections.content_plan) {
    const plan = contentPlans.find(p => p.slug === wizardSelections.content_plan);
    if (plan) {
      summaryItems.push(`<li>Your <strong>${plan.name}</strong> plan is active</li>`);
    }
  }

  if (wizardSelections.education_tier) {
    const tier = educationTiers.find(t => t.slug === wizardSelections.education_tier);
    if (tier) {
      summaryItems.push(`<li>Welcome to <strong>${tier.name}</strong> - check out the Learn tab!</li>`);
    }
  }

  contentEl.innerHTML = `
    <div class="wizard-step welcome-step">
      <div class="wizard-icon">&#127881;</div>
      <h2 class="wizard-title">${step.title}</h2>
      <p class="wizard-subtitle">${step.subtitle}</p>

      <div class="welcome-summary">
        <ul class="summary-list">
          ${summaryItems.join('')}
        </ul>
      </div>

      <div class="welcome-tips">
        <h4>Quick Tips:</h4>
        <ul>
          <li>Use the <strong>Image</strong> tab to generate AI images</li>
          <li>Try different characters from the dropdown</li>
          <li>Check out the <strong>Learn</strong> tab for tutorials</li>
        </ul>
      </div>
    </div>
  `;

  actionsEl.innerHTML = `
    <button class="wizard-btn primary large" onclick="completeOnboarding()">
      ${step.continue_button_text || 'Start Creating'}
    </button>
  `;
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
    <button class="wizard-btn primary" onclick="nextStep()">
      ${step.continue_button_text || 'Continue'}
    </button>
    ${!step.is_required ? `
      <button class="wizard-btn secondary" onclick="skipStep()">
        ${step.skip_button_text || 'Skip'}
      </button>
    ` : ''}
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
    renderCurrentStep();
  } else {
    completeOnboarding();
  }
}

// Skip current step
async function skipStep() {
  const step = onboardingConfig[currentStepIndex];
  await saveStepProgress(step.step_key, true);
  nextStep();
}

// Set billing cycle
function setBillingCycle(cycle) {
  billingCycle = cycle;
  renderCurrentStep();
}

// Select content plan
function selectContentPlan(slug) {
  wizardSelections.content_plan = slug;
  renderCurrentStep();
}

// Select education tier
function selectEducationTier(slug) {
  wizardSelections.education_tier = slug;
  renderCurrentStep();
}

// Handle plan selection (would integrate with payment)
async function handlePlanSelection() {
  const plan = contentPlans.find(p => p.slug === wizardSelections.content_plan);
  if (!plan) return;

  // TODO: Integrate with payment system
  // For now, just save selection and move on
  await saveStepProgress('choose_plan', false, {
    plan: wizardSelections.content_plan,
    billing_cycle: billingCycle
  });

  // Show payment modal or redirect to payment
  alert(`Payment integration coming soon!\nYou selected: ${plan.name} (${billingCycle})`);

  nextStep();
}

// Handle education selection (would integrate with payment)
async function handleEducationSelection() {
  const tier = educationTiers.find(t => t.slug === wizardSelections.education_tier);
  if (!tier) return;

  // TODO: Integrate with payment system
  await saveStepProgress('choose_education', false, {
    tier: wizardSelections.education_tier,
    billing_cycle: billingCycle
  });

  alert(`Payment integration coming soon!\nYou selected: ${tier.name} (${billingCycle})`);

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
  initializeOnboarding().then(() => {
    showOnboardingWizard('create_account');
  });

  return false; // Block action
}
