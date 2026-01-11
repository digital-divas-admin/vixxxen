// ===========================================
// ADMIN ONBOARDING WIZARD CONFIGURATION
// ===========================================
// Depends on: config.js (API_BASE_URL, currentUser), utils.js (escapeHtml)

// State
let onboardingAdminLoaded = false;
let adminPlans = [];
let adminTiers = [];
let adminSteps = [];
let adminStarterCharacters = [];
let adminPremiumCharacters = [];
let adminAllCharacters = [];
let currentOnboardingTab = 'plans';

// Drag state
let draggedElement = null;
let draggedIndex = null;

// ===========================================
// TAB SWITCHING
// ===========================================

function switchOnboardingTab(tab) {
  currentOnboardingTab = tab;

  // Update tab buttons
  document.querySelectorAll('.onboarding-tab-btn').forEach(btn => {
    if (btn.dataset.tab === tab) {
      btn.style.background = 'linear-gradient(135deg, #9d4edd, #ff2ebb)';
      btn.style.border = 'none';
      btn.style.color = '#fff';
      btn.classList.add('active');
    } else {
      btn.style.background = 'rgba(255,255,255,0.05)';
      btn.style.border = '1px solid rgba(157, 78, 221, 0.3)';
      btn.style.color = '#888';
      btn.classList.remove('active');
    }
  });

  // Update tab content
  document.querySelectorAll('.onboarding-tab-content').forEach(content => {
    content.style.display = 'none';
    content.classList.remove('active');
  });

  const tabMap = {
    'plans': 'onboardingPlansTab',
    'education': 'onboardingEducationTab',
    'characters': 'onboardingCharactersTab',
    'steps': 'onboardingStepsTab'
  };

  const targetTab = document.getElementById(tabMap[tab]);
  if (targetTab) {
    targetTab.style.display = 'block';
    targetTab.classList.add('active');
  }
}

// ===========================================
// MAIN LOAD FUNCTION
// ===========================================

async function loadOnboardingAdmin() {
  if (onboardingAdminLoaded) return;

  try {
    // Load all data in parallel
    await Promise.all([
      loadAdminPlans(),
      loadAdminTiers(),
      loadAdminSteps(),
      loadAdminCharacters()
    ]);

    onboardingAdminLoaded = true;
  } catch (error) {
    console.error('Error loading onboarding admin:', error);
  }
}

// ===========================================
// PLANS TAB
// ===========================================

async function loadAdminPlans() {
  try {
    const response = await authFetch(`${API_BASE_URL}/api/onboarding/admin/plans`);
    if (!response.ok) throw new Error('Failed to load plans');

    const data = await response.json();
    adminPlans = data.plans || [];

    renderPlansStats();
    renderPlansList();
  } catch (error) {
    console.error('Error loading plans:', error);
    document.getElementById('plansListContainer').innerHTML = `
      <div style="text-align: center; padding: 40px; color: #ff4444;">
        Failed to load plans. <button onclick="loadAdminPlans()" style="color: #9d4edd; background: none; border: none; cursor: pointer; text-decoration: underline;">Retry</button>
      </div>
    `;
  }
}

function renderPlansStats() {
  const activePlans = adminPlans.filter(p => p.is_active);
  const prices = activePlans.map(p => parseFloat(p.price_monthly) || 0).filter(p => p > 0);
  const credits = activePlans.map(p => parseInt(p.credits_monthly) || 0).filter(c => c > 0);

  document.getElementById('plansActiveCount').textContent = activePlans.length;
  document.getElementById('plansRevenueRange').textContent = prices.length > 0
    ? `$${Math.min(...prices)}-$${Math.max(...prices)}`
    : '$0';
  document.getElementById('plansCreditsRange').textContent = credits.length > 0
    ? `${Math.min(...credits)}-${Math.max(...credits)}`
    : '0';
}

function renderPlansList() {
  const container = document.getElementById('plansListContainer');

  if (!adminPlans || adminPlans.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; background: rgba(255,255,255,0.02); border-radius: 16px;">
        <div style="font-size: 3rem; margin-bottom: 12px;">📦</div>
        <div style="color: #888; font-size: 0.95rem;">No plans configured yet. Add your first plan!</div>
      </div>
    `;
    return;
  }

  // Sort by display_order
  const sortedPlans = [...adminPlans].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  container.innerHTML = sortedPlans.map((plan, index) => {
    const features = Array.isArray(plan.features) ? plan.features : [];
    const isActive = plan.is_active !== false;

    return `
      <div class="admin-plan-card" draggable="true" data-plan-slug="${plan.slug}" data-index="${index}"
           ondragstart="handleDragStart(event, 'plan')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'plan')" ondragend="handleDragEnd(event)"
           style="background: ${isActive ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)'}; border: 1px solid ${isActive ? 'rgba(157, 78, 221, 0.3)' : 'rgba(255,255,255,0.1)'}; border-radius: 12px; padding: 20px; margin-bottom: 12px; opacity: ${isActive ? '1' : '0.6'}; cursor: grab;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="cursor: grab; color: #666; font-size: 1.2rem;">⋮⋮</span>
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.1rem; font-weight: 600; color: #fff;">${escapeHtml(plan.name || 'Unnamed')}</span>
                <span style="color: #666; font-size: 0.85rem;">(${escapeHtml(plan.slug || '')})</span>
                ${plan.badge_text ? `<span style="background: linear-gradient(135deg, #9d4edd, #ff2ebb); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; color: #fff;">${escapeHtml(plan.badge_text)}</span>` : ''}
              </div>
              <div style="color: #888; font-size: 0.85rem; margin-top: 4px;">
                $${plan.price_monthly || 0}/mo · $${plan.price_annual || 0}/yr · ${plan.credits_monthly || 0} credits
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: ${isActive ? '#4ade80' : '#666'}; font-size: 0.8rem;">${isActive ? '● Active' : '○ Inactive'}</span>
          </div>
        </div>

        ${plan.description ? `<div style="color: #aaa; font-size: 0.9rem; margin-bottom: 12px;">${escapeHtml(plan.description)}</div>` : ''}

        ${features.length > 0 ? `
          <div style="margin-bottom: 16px;">
            <div style="color: #888; font-size: 0.8rem; margin-bottom: 8px;">Features:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${features.slice(0, 5).map(f => `<span style="background: rgba(157, 78, 221, 0.1); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; color: #9d4edd;">${escapeHtml(f)}</span>`).join('')}
              ${features.length > 5 ? `<span style="color: #666; font-size: 0.8rem; padding: 4px;">+${features.length - 5} more</span>` : ''}
            </div>
          </div>
        ` : ''}

        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button onclick="openPlanModal('${plan.slug}')" style="padding: 8px 16px; background: rgba(157, 78, 221, 0.2); border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 8px; color: #9d4edd; cursor: pointer; font-size: 0.85rem;">
            Edit
          </button>
          <button onclick="duplicatePlan('${plan.slug}')" style="padding: 8px 16px; background: rgba(0, 178, 255, 0.1); border: 1px solid rgba(0, 178, 255, 0.2); border-radius: 8px; color: #00b2ff; cursor: pointer; font-size: 0.85rem;">
            Duplicate
          </button>
          <button onclick="togglePlanActive('${plan.slug}', ${!isActive})" style="padding: 8px 16px; background: ${isActive ? 'rgba(255, 165, 0, 0.1)' : 'rgba(74, 222, 128, 0.1)'}; border: 1px solid ${isActive ? 'rgba(255, 165, 0, 0.2)' : 'rgba(74, 222, 128, 0.2)'}; border-radius: 8px; color: ${isActive ? '#ffa500' : '#4ade80'}; cursor: pointer; font-size: 0.85rem;">
            ${isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openPlanModal(slug = null) {
  const plan = slug ? adminPlans.find(p => p.slug === slug) : null;
  const isEdit = !!plan;

  const features = plan?.features || [];

  const modal = document.createElement('div');
  modal.id = 'planEditModal';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;';

  modal.innerHTML = `
    <div style="background: #1a1a1a; border-radius: 16px; padding: 32px; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <h3 style="margin: 0; font-size: 1.3rem; color: #fff;">${isEdit ? 'Edit Plan' : 'Add New Plan'}</h3>
        <button onclick="closePlanModal()" style="background: none; border: none; color: #888; font-size: 1.5rem; cursor: pointer;">×</button>
      </div>

      <form id="planForm" onsubmit="savePlan(event, '${slug || ''}')">
        <div style="display: grid; gap: 16px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Name *</label>
              <input type="text" id="planName" value="${escapeHtml(plan?.name || '')}" required style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem;">
            </div>
            <div>
              <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Slug * ${isEdit ? '(read-only)' : ''}</label>
              <input type="text" id="planSlug" value="${escapeHtml(plan?.slug || '')}" ${isEdit ? 'readonly' : 'required'} pattern="[a-z0-9-]+" title="Lowercase letters, numbers, and hyphens only" style="width: 100%; padding: 12px; background: ${isEdit ? '#1a1a1a' : '#252525'}; border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 8px; color: ${isEdit ? '#666' : '#fff'}; font-size: 0.9rem;">
            </div>
          </div>

          <div>
            <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Description</label>
            <input type="text" id="planDescription" value="${escapeHtml(plan?.description || '')}" style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem;">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
            <div>
              <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Monthly Price ($)</label>
              <input type="number" id="planPriceMonthly" value="${plan?.price_monthly || ''}" min="0" step="0.01" style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem;">
            </div>
            <div>
              <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Annual Price ($)</label>
              <input type="number" id="planPriceAnnual" value="${plan?.price_annual || ''}" min="0" step="0.01" style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem;">
            </div>
            <div>
              <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Credits/Month</label>
              <input type="number" id="planCredits" value="${plan?.credits_monthly || ''}" min="0" style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem;">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Badge Text (optional)</label>
              <input type="text" id="planBadge" value="${escapeHtml(plan?.badge_text || '')}" placeholder="e.g., Most Popular" style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem;">
            </div>
            <div>
              <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Display Order</label>
              <input type="number" id="planOrder" value="${plan?.display_order || 0}" min="0" style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem;">
            </div>
          </div>

          <div>
            <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Features (one per line)</label>
            <textarea id="planFeatures" rows="5" placeholder="500 credits per month\nPriority generation\nHD exports" style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem; resize: vertical;">${features.join('\n')}</textarea>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="planActive" ${plan?.is_active !== false ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #9d4edd;">
              <span style="color: #fff; font-size: 0.9rem;">Active (visible in wizard)</span>
            </label>
          </div>
        </div>

        <div style="display: flex; gap: 12px; margin-top: 24px; justify-content: flex-end;">
          <button type="button" onclick="closePlanModal()" style="padding: 12px 24px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #888; cursor: pointer; font-size: 0.9rem;">
            Cancel
          </button>
          <button type="submit" style="padding: 12px 24px; background: linear-gradient(135deg, #9d4edd, #ff2ebb); border: none; border-radius: 8px; color: #fff; cursor: pointer; font-size: 0.9rem; font-weight: 500;">
            ${isEdit ? 'Save Changes' : 'Create Plan'}
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePlanModal();
  });
}

function closePlanModal() {
  const modal = document.getElementById('planEditModal');
  if (modal) modal.remove();
}

async function savePlan(event, existingSlug) {
  event.preventDefault();

  const featuresText = document.getElementById('planFeatures').value;
  const features = featuresText.split('\n').map(f => f.trim()).filter(f => f);

  const planData = {
    name: document.getElementById('planName').value.trim(),
    slug: existingSlug || document.getElementById('planSlug').value.trim(),
    description: document.getElementById('planDescription').value.trim(),
    price_monthly: parseFloat(document.getElementById('planPriceMonthly').value) || 0,
    price_annual: parseFloat(document.getElementById('planPriceAnnual').value) || 0,
    credits_monthly: parseInt(document.getElementById('planCredits').value) || 0,
    badge_text: document.getElementById('planBadge').value.trim() || null,
    display_order: parseInt(document.getElementById('planOrder').value) || 0,
    features: features,
    is_active: document.getElementById('planActive').checked
  };

  // Validation
  if (!planData.name) {
    alert('Name is required');
    return;
  }
  if (!planData.slug) {
    alert('Slug is required');
    return;
  }
  if (!/^[a-z0-9-]+$/.test(planData.slug)) {
    alert('Slug must contain only lowercase letters, numbers, and hyphens');
    return;
  }

  try {
    const isEdit = !!existingSlug;
    const url = isEdit
      ? `${API_BASE_URL}/api/onboarding/admin/plans/${existingSlug}`
      : `${API_BASE_URL}/api/onboarding/admin/plans`;

    const response = await authFetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(planData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save plan');
    }

    closePlanModal();
    onboardingAdminLoaded = false;
    await loadAdminPlans();

  } catch (error) {
    console.error('Error saving plan:', error);
    alert('Failed to save plan: ' + error.message);
  }
}

async function togglePlanActive(slug, active) {
  try {
    const response = await authFetch(`${API_BASE_URL}/api/onboarding/admin/plans/${slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: active })
    });

    if (!response.ok) throw new Error('Failed to update plan');

    await loadAdminPlans();
  } catch (error) {
    console.error('Error toggling plan:', error);
    alert('Failed to update plan');
  }
}

async function duplicatePlan(slug) {
  const plan = adminPlans.find(p => p.slug === slug);
  if (!plan) return;

  const newSlug = prompt('Enter slug for the new plan:', plan.slug + '-copy');
  if (!newSlug) return;

  if (!/^[a-z0-9-]+$/.test(newSlug)) {
    alert('Slug must contain only lowercase letters, numbers, and hyphens');
    return;
  }

  try {
    const response = await authFetch(`${API_BASE_URL}/api/onboarding/admin/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...plan,
        slug: newSlug,
        name: plan.name + ' (Copy)',
        id: undefined
      })
    });

    if (!response.ok) throw new Error('Failed to duplicate plan');

    await loadAdminPlans();
  } catch (error) {
    console.error('Error duplicating plan:', error);
    alert('Failed to duplicate plan: ' + error.message);
  }
}

// ===========================================
// EDUCATION TIERS TAB
// ===========================================

async function loadAdminTiers() {
  try {
    const response = await authFetch(`${API_BASE_URL}/api/onboarding/admin/tiers`);
    if (!response.ok) throw new Error('Failed to load tiers');

    const data = await response.json();
    adminTiers = data.tiers || [];

    renderTiersStats();
    renderTiersList();
  } catch (error) {
    console.error('Error loading tiers:', error);
    document.getElementById('tiersListContainer').innerHTML = `
      <div style="text-align: center; padding: 40px; color: #ff4444;">
        Failed to load education tiers. <button onclick="loadAdminTiers()" style="color: #9d4edd; background: none; border: none; cursor: pointer; text-decoration: underline;">Retry</button>
      </div>
    `;
  }
}

function renderTiersStats() {
  const activeTiers = adminTiers.filter(t => t.is_active);
  const withWorkshops = adminTiers.filter(t => t.has_live_workshops).length;
  const withMentorship = adminTiers.filter(t => t.has_mentorship).length;

  document.getElementById('tiersActiveCount').textContent = activeTiers.length;
  document.getElementById('tiersWithWorkshops').textContent = withWorkshops;
  document.getElementById('tiersWithMentorship').textContent = withMentorship;
}

function renderTiersList() {
  const container = document.getElementById('tiersListContainer');

  if (!adminTiers || adminTiers.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; background: rgba(255,255,255,0.02); border-radius: 16px;">
        <div style="font-size: 3rem; margin-bottom: 12px;">🎓</div>
        <div style="color: #888; font-size: 0.95rem;">No education tiers configured yet. Add your first tier!</div>
      </div>
    `;
    return;
  }

  const sortedTiers = [...adminTiers].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  container.innerHTML = sortedTiers.map((tier, index) => {
    const features = Array.isArray(tier.features) ? tier.features : [];
    const isActive = tier.is_active !== false;

    return `
      <div class="admin-tier-card" draggable="true" data-tier-slug="${tier.slug}" data-index="${index}"
           ondragstart="handleDragStart(event, 'tier')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'tier')" ondragend="handleDragEnd(event)"
           style="background: ${isActive ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)'}; border: 1px solid ${isActive ? 'rgba(157, 78, 221, 0.3)' : 'rgba(255,255,255,0.1)'}; border-radius: 12px; padding: 20px; margin-bottom: 12px; opacity: ${isActive ? '1' : '0.6'}; cursor: grab;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="cursor: grab; color: #666; font-size: 1.2rem;">⋮⋮</span>
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.1rem; font-weight: 600; color: #fff;">${escapeHtml(tier.name || 'Unnamed')}</span>
                <span style="color: #666; font-size: 0.85rem;">(${escapeHtml(tier.slug || '')})</span>
                ${tier.badge_text ? `<span style="background: linear-gradient(135deg, #ffa500, #ff6600); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; color: #fff;">${escapeHtml(tier.badge_text)}</span>` : ''}
              </div>
              <div style="color: #888; font-size: 0.85rem; margin-top: 4px;">
                $${tier.price_monthly || 0}/mo · $${tier.price_annual || 0}/yr
                ${tier.has_live_workshops ? ' · 📹 Workshops' : ''}
                ${tier.has_mentorship ? ' · 🧑‍🏫 Mentorship' : ''}
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: ${isActive ? '#4ade80' : '#666'}; font-size: 0.8rem;">${isActive ? '● Active' : '○ Inactive'}</span>
          </div>
        </div>

        ${tier.description ? `<div style="color: #aaa; font-size: 0.9rem; margin-bottom: 12px;">${escapeHtml(tier.description)}</div>` : ''}

        ${features.length > 0 ? `
          <div style="margin-bottom: 16px;">
            <div style="color: #888; font-size: 0.8rem; margin-bottom: 8px;">Features:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${features.slice(0, 5).map(f => `<span style="background: rgba(255, 165, 0, 0.1); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; color: #ffa500;">${escapeHtml(f)}</span>`).join('')}
              ${features.length > 5 ? `<span style="color: #666; font-size: 0.8rem; padding: 4px;">+${features.length - 5} more</span>` : ''}
            </div>
          </div>
        ` : ''}

        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button onclick="openTierModal('${tier.slug}')" style="padding: 8px 16px; background: rgba(255, 165, 0, 0.2); border: 1px solid rgba(255, 165, 0, 0.3); border-radius: 8px; color: #ffa500; cursor: pointer; font-size: 0.85rem;">
            Edit
          </button>
          <button onclick="duplicateTier('${tier.slug}')" style="padding: 8px 16px; background: rgba(0, 178, 255, 0.1); border: 1px solid rgba(0, 178, 255, 0.2); border-radius: 8px; color: #00b2ff; cursor: pointer; font-size: 0.85rem;">
            Duplicate
          </button>
          <button onclick="toggleTierActive('${tier.slug}', ${!isActive})" style="padding: 8px 16px; background: ${isActive ? 'rgba(255, 68, 68, 0.1)' : 'rgba(74, 222, 128, 0.1)'}; border: 1px solid ${isActive ? 'rgba(255, 68, 68, 0.2)' : 'rgba(74, 222, 128, 0.2)'}; border-radius: 8px; color: ${isActive ? '#ff4444' : '#4ade80'}; cursor: pointer; font-size: 0.85rem;">
            ${isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openTierModal(slug = null) {
  const tier = slug ? adminTiers.find(t => t.slug === slug) : null;
  const isEdit = !!tier;

  const features = tier?.features || [];

  const modal = document.createElement('div');
  modal.id = 'tierEditModal';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;';

  modal.innerHTML = `
    <div style="background: #1a1a1a; border-radius: 16px; padding: 32px; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <h3 style="margin: 0; font-size: 1.3rem; color: #fff;">${isEdit ? 'Edit Education Tier' : 'Add New Education Tier'}</h3>
        <button onclick="closeTierModal()" style="background: none; border: none; color: #888; font-size: 1.5rem; cursor: pointer;">×</button>
      </div>

      <form id="tierForm" onsubmit="saveTier(event, '${slug || ''}')">
        <div style="display: grid; gap: 16px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Name *</label>
              <input type="text" id="tierName" value="${escapeHtml(tier?.name || '')}" required style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(255, 165, 0, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem;">
            </div>
            <div>
              <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Slug * ${isEdit ? '(read-only)' : ''}</label>
              <input type="text" id="tierSlug" value="${escapeHtml(tier?.slug || '')}" ${isEdit ? 'readonly' : 'required'} pattern="[a-z0-9-]+" style="width: 100%; padding: 12px; background: ${isEdit ? '#1a1a1a' : '#252525'}; border: 1px solid rgba(255, 165, 0, 0.3); border-radius: 8px; color: ${isEdit ? '#666' : '#fff'}; font-size: 0.9rem;">
            </div>
          </div>

          <div>
            <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Description</label>
            <input type="text" id="tierDescription" value="${escapeHtml(tier?.description || '')}" style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(255, 165, 0, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem;">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Monthly Price ($)</label>
              <input type="number" id="tierPriceMonthly" value="${tier?.price_monthly || ''}" min="0" step="0.01" style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(255, 165, 0, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem;">
            </div>
            <div>
              <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Annual Price ($)</label>
              <input type="number" id="tierPriceAnnual" value="${tier?.price_annual || ''}" min="0" step="0.01" style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(255, 165, 0, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem;">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Badge Text (optional)</label>
              <input type="text" id="tierBadge" value="${escapeHtml(tier?.badge_text || '')}" placeholder="e.g., Popular" style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(255, 165, 0, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem;">
            </div>
            <div>
              <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Display Order</label>
              <input type="number" id="tierOrder" value="${tier?.display_order || 0}" min="0" style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(255, 165, 0, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem;">
            </div>
          </div>

          <div style="display: flex; gap: 24px; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="tierWorkshops" ${tier?.has_live_workshops ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #ffa500;">
              <span style="color: #fff; font-size: 0.9rem;">Has Live Workshops</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="tierMentorship" ${tier?.has_mentorship ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #ffa500;">
              <span style="color: #fff; font-size: 0.9rem;">Has 1:1 Mentorship</span>
            </label>
          </div>

          <div>
            <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Features (one per line)</label>
            <textarea id="tierFeatures" rows="5" placeholder="Self-paced guides\nCommunity access\nLive workshops" style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(255, 165, 0, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem; resize: vertical;">${features.join('\n')}</textarea>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="tierActive" ${tier?.is_active !== false ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #ffa500;">
              <span style="color: #fff; font-size: 0.9rem;">Active (visible in wizard)</span>
            </label>
          </div>
        </div>

        <div style="display: flex; gap: 12px; margin-top: 24px; justify-content: flex-end;">
          <button type="button" onclick="closeTierModal()" style="padding: 12px 24px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #888; cursor: pointer; font-size: 0.9rem;">
            Cancel
          </button>
          <button type="submit" style="padding: 12px 24px; background: linear-gradient(135deg, #ffa500, #ff6600); border: none; border-radius: 8px; color: #fff; cursor: pointer; font-size: 0.9rem; font-weight: 500;">
            ${isEdit ? 'Save Changes' : 'Create Tier'}
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeTierModal();
  });
}

function closeTierModal() {
  const modal = document.getElementById('tierEditModal');
  if (modal) modal.remove();
}

async function saveTier(event, existingSlug) {
  event.preventDefault();

  const featuresText = document.getElementById('tierFeatures').value;
  const features = featuresText.split('\n').map(f => f.trim()).filter(f => f);

  const tierData = {
    name: document.getElementById('tierName').value.trim(),
    slug: existingSlug || document.getElementById('tierSlug').value.trim(),
    description: document.getElementById('tierDescription').value.trim(),
    price_monthly: parseFloat(document.getElementById('tierPriceMonthly').value) || 0,
    price_annual: parseFloat(document.getElementById('tierPriceAnnual').value) || 0,
    badge_text: document.getElementById('tierBadge').value.trim() || null,
    display_order: parseInt(document.getElementById('tierOrder').value) || 0,
    has_live_workshops: document.getElementById('tierWorkshops').checked,
    has_mentorship: document.getElementById('tierMentorship').checked,
    features: features,
    is_active: document.getElementById('tierActive').checked
  };

  if (!tierData.name || !tierData.slug) {
    alert('Name and slug are required');
    return;
  }

  try {
    const isEdit = !!existingSlug;
    const url = isEdit
      ? `${API_BASE_URL}/api/onboarding/admin/tiers/${existingSlug}`
      : `${API_BASE_URL}/api/onboarding/admin/tiers`;

    const response = await authFetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(tierData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save tier');
    }

    closeTierModal();
    onboardingAdminLoaded = false;
    await loadAdminTiers();

  } catch (error) {
    console.error('Error saving tier:', error);
    alert('Failed to save tier: ' + error.message);
  }
}

async function toggleTierActive(slug, active) {
  try {
    const response = await authFetch(`${API_BASE_URL}/api/onboarding/admin/tiers/${slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: active })
    });

    if (!response.ok) throw new Error('Failed to update tier');

    await loadAdminTiers();
  } catch (error) {
    console.error('Error toggling tier:', error);
    alert('Failed to update tier');
  }
}

async function duplicateTier(slug) {
  const tier = adminTiers.find(t => t.slug === slug);
  if (!tier) return;

  const newSlug = prompt('Enter slug for the new tier:', tier.slug + '-copy');
  if (!newSlug) return;

  try {
    const response = await authFetch(`${API_BASE_URL}/api/onboarding/admin/tiers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...tier,
        slug: newSlug,
        name: tier.name + ' (Copy)',
        id: undefined
      })
    });

    if (!response.ok) throw new Error('Failed to duplicate tier');

    await loadAdminTiers();
  } catch (error) {
    console.error('Error duplicating tier:', error);
    alert('Failed to duplicate tier: ' + error.message);
  }
}

// ===========================================
// CHARACTERS TAB
// ===========================================

async function loadAdminCharacters() {
  try {
    // Load all characters from marketplace
    const response = await authFetch(`${API_BASE_URL}/api/onboarding/admin/all-characters`);
    if (!response.ok) throw new Error('Failed to load characters');

    const data = await response.json();
    adminAllCharacters = data.characters || [];

    // Separate starters and premium
    adminStarterCharacters = adminAllCharacters.filter(c => c.is_starter);
    adminPremiumCharacters = adminAllCharacters.filter(c => !c.is_starter);

    renderCharactersStats();
    renderStarterCharacters();
    renderPremiumCharacters();
    populateCategoryFilter();

  } catch (error) {
    console.error('Error loading characters:', error);
    document.getElementById('starterCharactersList').innerHTML = `
      <div style="color: #ff4444; padding: 20px;">Failed to load characters. <button onclick="loadAdminCharacters()" style="color: #4ade80; background: none; border: none; cursor: pointer;">Retry</button></div>
    `;
  }
}

function renderCharactersStats() {
  document.getElementById('starterCharactersCount').textContent = adminStarterCharacters.length;
  document.getElementById('premiumCharactersCount').textContent = adminPremiumCharacters.length;
  document.getElementById('totalCharactersCount').textContent = adminAllCharacters.length;
}

function renderStarterCharacters() {
  const container = document.getElementById('starterCharactersList');

  if (!adminStarterCharacters || adminStarterCharacters.length === 0) {
    container.innerHTML = `
      <div style="color: #888; font-size: 0.9rem; padding: 20px; text-align: center; width: 100%;">
        No starter characters yet. Click a premium character below to make it a starter.
      </div>
    `;
    return;
  }

  // Sort by sort_order
  const sorted = [...adminStarterCharacters].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  container.innerHTML = sorted.map((char, index) => `
    <div class="starter-char-card" draggable="true" data-char-id="${char.id}" data-index="${index}"
         ondragstart="handleDragStart(event, 'starter')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'starter')" ondragend="handleDragEnd(event)"
         style="width: 120px; background: #252525; border-radius: 12px; overflow: hidden; cursor: grab; border: 2px solid rgba(74, 222, 128, 0.3);">
      <div style="width: 100%; height: 100px; background: ${char.image_url ? `url('${char.image_url}') center/cover` : 'linear-gradient(135deg, #4ade80, #22c55e)'}; display: flex; align-items: center; justify-content: center;">
        ${!char.image_url ? '<span style="font-size: 2rem;">✨</span>' : ''}
      </div>
      <div style="padding: 10px;">
        <div style="font-size: 0.85rem; font-weight: 600; color: #fff; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(char.name)}</div>
        <div style="font-size: 0.75rem; color: #888;">${escapeHtml(char.category || 'General')}</div>
        <button onclick="removeFromStarters('${char.id}')" style="margin-top: 8px; width: 100%; padding: 6px; background: rgba(255, 68, 68, 0.2); border: none; border-radius: 6px; color: #ff4444; cursor: pointer; font-size: 0.75rem;">
          Remove
        </button>
      </div>
    </div>
  `).join('');
}

function renderPremiumCharacters() {
  const container = document.getElementById('premiumCharactersList');
  const searchTerm = document.getElementById('characterSearchInput')?.value?.toLowerCase() || '';
  const categoryFilter = document.getElementById('characterCategoryFilter')?.value || '';

  let filtered = adminPremiumCharacters;

  if (searchTerm) {
    filtered = filtered.filter(c =>
      c.name?.toLowerCase().includes(searchTerm) ||
      c.category?.toLowerCase().includes(searchTerm)
    );
  }

  if (categoryFilter) {
    filtered = filtered.filter(c => c.category === categoryFilter);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="color: #888; font-size: 0.9rem; padding: 20px; text-align: center; width: 100%;">
        ${adminPremiumCharacters.length === 0 ? 'No premium characters available.' : 'No characters match your search.'}
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(char => `
    <div class="premium-char-card" onclick="makeStarter('${char.id}')"
         style="width: 120px; background: #252525; border-radius: 12px; overflow: hidden; cursor: pointer; border: 2px solid transparent; transition: all 0.2s;"
         onmouseenter="this.style.borderColor='rgba(255, 46, 187, 0.5)'" onmouseleave="this.style.borderColor='transparent'">
      <div style="width: 100%; height: 100px; background: ${char.image_url ? `url('${char.image_url}') center/cover` : 'linear-gradient(135deg, #ff2ebb, #9d4edd)'}; display: flex; align-items: center; justify-content: center;">
        ${!char.image_url ? '<span style="font-size: 2rem;">💎</span>' : ''}
      </div>
      <div style="padding: 10px;">
        <div style="font-size: 0.85rem; font-weight: 600; color: #fff; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(char.name)}</div>
        <div style="font-size: 0.75rem; color: #888; display: flex; justify-content: space-between;">
          <span>${escapeHtml(char.category || 'General')}</span>
          <span style="color: #ff2ebb;">$${char.price || 0}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function populateCategoryFilter() {
  const select = document.getElementById('characterCategoryFilter');
  if (!select) return;

  const categories = [...new Set(adminAllCharacters.map(c => c.category).filter(Boolean))].sort();

  select.innerHTML = `
    <option value="">All Categories</option>
    ${categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('')}
  `;
}

function filterPremiumCharacters() {
  renderPremiumCharacters();
}

async function makeStarter(charId) {
  try {
    const response = await authFetch(`${API_BASE_URL}/api/onboarding/admin/starter-character/${charId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_starter: true })
    });

    if (!response.ok) throw new Error('Failed to update character');

    await loadAdminCharacters();
  } catch (error) {
    console.error('Error making starter:', error);
    alert('Failed to update character');
  }
}

async function removeFromStarters(charId) {
  try {
    const response = await authFetch(`${API_BASE_URL}/api/onboarding/admin/starter-character/${charId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_starter: false })
    });

    if (!response.ok) throw new Error('Failed to update character');

    await loadAdminCharacters();
  } catch (error) {
    console.error('Error removing starter:', error);
    alert('Failed to update character');
  }
}

// ===========================================
// STEPS TAB
// ===========================================

async function loadAdminSteps() {
  try {
    const response = await authFetch(`${API_BASE_URL}/api/onboarding/admin/config`);
    if (!response.ok) throw new Error('Failed to load steps');

    const data = await response.json();
    adminSteps = data.steps || [];

    renderStepsList();
  } catch (error) {
    console.error('Error loading steps:', error);
    document.getElementById('stepsListContainer').innerHTML = `
      <div style="text-align: center; padding: 40px; color: #ff4444;">
        Failed to load steps. <button onclick="loadAdminSteps()" style="color: #9d4edd; background: none; border: none; cursor: pointer;">Retry</button>
      </div>
    `;
  }
}

function renderStepsList() {
  const container = document.getElementById('stepsListContainer');

  if (!adminSteps || adminSteps.length === 0) {
    container.innerHTML = `<div style="color: #888; text-align: center; padding: 20px;">No wizard steps configured.</div>`;
    return;
  }

  const sortedSteps = [...adminSteps].sort((a, b) => (a.step_order || 0) - (b.step_order || 0));

  container.innerHTML = sortedSteps.map(step => {
    const isEnabled = step.is_enabled !== false;
    const config = step.config || {};

    return `
      <div style="background: ${isEnabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)'}; border: 1px solid ${isEnabled ? 'rgba(157, 78, 221, 0.2)' : 'rgba(255,255,255,0.05)'}; border-radius: 12px; margin-bottom: 12px; overflow: hidden; opacity: ${isEnabled ? '1' : '0.6'};">
        <div style="padding: 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="toggleStepExpand('${step.step_key}')">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="color: #9d4edd; font-weight: 600;">${step.step_order || 0}.</span>
            <div>
              <div style="font-weight: 600; color: #fff;">${escapeHtml(step.title || step.step_key)}</div>
              <div style="font-size: 0.8rem; color: #666;">${escapeHtml(step.step_key)}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="color: ${isEnabled ? '#4ade80' : '#666'}; font-size: 0.8rem;">${isEnabled ? '● Enabled' : '○ Disabled'}</span>
            <span id="stepArrow_${step.step_key}" style="color: #666; transition: transform 0.2s;">▼</span>
          </div>
        </div>
        <div id="stepDetails_${step.step_key}" style="display: none; padding: 0 16px 16px; border-top: 1px solid rgba(255,255,255,0.05);">
          <div style="padding-top: 16px; display: grid; gap: 12px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; color: #888; font-size: 0.8rem; margin-bottom: 4px;">Title</label>
                <input type="text" id="stepTitle_${step.step_key}" value="${escapeHtml(step.title || '')}" style="width: 100%; padding: 10px; background: #1a1a1a; border: 1px solid rgba(157, 78, 221, 0.2); border-radius: 6px; color: #fff; font-size: 0.85rem;">
              </div>
              <div>
                <label style="display: block; color: #888; font-size: 0.8rem; margin-bottom: 4px;">Subtitle</label>
                <input type="text" id="stepSubtitle_${step.step_key}" value="${escapeHtml(step.subtitle || '')}" style="width: 100%; padding: 10px; background: #1a1a1a; border: 1px solid rgba(157, 78, 221, 0.2); border-radius: 6px; color: #fff; font-size: 0.85rem;">
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; color: #888; font-size: 0.8rem; margin-bottom: 4px;">Continue Button Text</label>
                <input type="text" id="stepContinue_${step.step_key}" value="${escapeHtml(step.continue_button_text || '')}" style="width: 100%; padding: 10px; background: #1a1a1a; border: 1px solid rgba(157, 78, 221, 0.2); border-radius: 6px; color: #fff; font-size: 0.85rem;">
              </div>
              <div>
                <label style="display: block; color: #888; font-size: 0.8rem; margin-bottom: 4px;">Skip Button Text</label>
                <input type="text" id="stepSkip_${step.step_key}" value="${escapeHtml(step.skip_button_text || '')}" style="width: 100%; padding: 10px; background: #1a1a1a; border: 1px solid rgba(157, 78, 221, 0.2); border-radius: 6px; color: #fff; font-size: 0.85rem;">
              </div>
            </div>
            ${config.credits_bonus !== undefined ? `
              <div>
                <label style="display: block; color: #888; font-size: 0.8rem; margin-bottom: 4px;">Bonus Credits</label>
                <input type="number" id="stepCredits_${step.step_key}" value="${config.credits_bonus || 0}" min="0" style="width: 150px; padding: 10px; background: #1a1a1a; border: 1px solid rgba(157, 78, 221, 0.2); border-radius: 6px; color: #fff; font-size: 0.85rem;">
              </div>
            ` : ''}
            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="checkbox" id="stepEnabled_${step.step_key}" ${isEnabled ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: #9d4edd;">
                <span style="color: #fff; font-size: 0.85rem;">Enabled</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="checkbox" id="stepRequired_${step.step_key}" ${step.is_required ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: #9d4edd;">
                <span style="color: #fff; font-size: 0.85rem;">Required (cannot skip)</span>
              </label>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
              <button onclick="saveStep('${step.step_key}')" style="padding: 8px 16px; background: linear-gradient(135deg, #9d4edd, #ff2ebb); border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 0.85rem;">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleStepExpand(stepKey) {
  const details = document.getElementById(`stepDetails_${stepKey}`);
  const arrow = document.getElementById(`stepArrow_${stepKey}`);

  if (details.style.display === 'none') {
    details.style.display = 'block';
    arrow.style.transform = 'rotate(180deg)';
  } else {
    details.style.display = 'none';
    arrow.style.transform = 'rotate(0deg)';
  }
}

async function saveStep(stepKey) {
  const step = adminSteps.find(s => s.step_key === stepKey);
  if (!step) return;

  const stepData = {
    title: document.getElementById(`stepTitle_${stepKey}`)?.value?.trim() || '',
    subtitle: document.getElementById(`stepSubtitle_${stepKey}`)?.value?.trim() || '',
    continue_button_text: document.getElementById(`stepContinue_${stepKey}`)?.value?.trim() || '',
    skip_button_text: document.getElementById(`stepSkip_${stepKey}`)?.value?.trim() || '',
    is_enabled: document.getElementById(`stepEnabled_${stepKey}`)?.checked,
    is_required: document.getElementById(`stepRequired_${stepKey}`)?.checked
  };

  // Handle config with credits_bonus
  const creditsInput = document.getElementById(`stepCredits_${stepKey}`);
  if (creditsInput) {
    stepData.config = { ...step.config, credits_bonus: parseInt(creditsInput.value) || 0 };
  }

  try {
    const response = await authFetch(`${API_BASE_URL}/api/onboarding/admin/config/${stepKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stepData)
    });

    if (!response.ok) throw new Error('Failed to save step');

    // Show success feedback
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✓ Saved';
    btn.style.background = 'linear-gradient(135deg, #4ade80, #22c55e)';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = 'linear-gradient(135deg, #9d4edd, #ff2ebb)';
    }, 1500);

    await loadAdminSteps();

  } catch (error) {
    console.error('Error saving step:', error);
    alert('Failed to save step');
  }
}

// ===========================================
// DRAG AND DROP
// ===========================================

function handleDragStart(event, type) {
  draggedElement = event.target.closest(`[data-${type === 'plan' ? 'plan-slug' : type === 'tier' ? 'tier-slug' : 'char-id'}]`);
  draggedIndex = parseInt(draggedElement.dataset.index);
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', type);

  setTimeout(() => {
    draggedElement.style.opacity = '0.5';
  }, 0);
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';

  const target = event.target.closest('[data-index]');
  if (target && target !== draggedElement) {
    target.style.borderTop = '2px solid #9d4edd';
  }
}

function handleDrop(event, type) {
  event.preventDefault();

  const target = event.target.closest('[data-index]');
  if (!target || target === draggedElement) return;

  const targetIndex = parseInt(target.dataset.index);

  // Remove drag styling
  document.querySelectorAll('[data-index]').forEach(el => {
    el.style.borderTop = '';
  });

  // Reorder based on type
  if (type === 'plan') {
    reorderPlans(draggedIndex, targetIndex);
  } else if (type === 'tier') {
    reorderTiers(draggedIndex, targetIndex);
  } else if (type === 'starter') {
    reorderStarters(draggedIndex, targetIndex);
  }
}

function handleDragEnd(event) {
  if (draggedElement) {
    draggedElement.style.opacity = '1';
  }
  draggedElement = null;
  draggedIndex = null;

  // Clean up any remaining drag styling
  document.querySelectorAll('[data-index]').forEach(el => {
    el.style.borderTop = '';
  });
}

async function reorderPlans(fromIndex, toIndex) {
  const sortedPlans = [...adminPlans].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const [moved] = sortedPlans.splice(fromIndex, 1);
  sortedPlans.splice(toIndex, 0, moved);

  // Update display_order for all
  const updates = sortedPlans.map((plan, idx) => ({
    slug: plan.slug,
    display_order: idx
  }));

  try {
    await Promise.all(updates.map(u =>
      authFetch(`${API_BASE_URL}/api/onboarding/admin/plans/${u.slug}`, {
        method: 'PUT',
        body: JSON.stringify({ display_order: u.display_order })
      })
    ));

    await loadAdminPlans();
  } catch (error) {
    console.error('Error reordering plans:', error);
  }
}

async function reorderTiers(fromIndex, toIndex) {
  const sortedTiers = [...adminTiers].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const [moved] = sortedTiers.splice(fromIndex, 1);
  sortedTiers.splice(toIndex, 0, moved);

  const updates = sortedTiers.map((tier, idx) => ({
    slug: tier.slug,
    display_order: idx
  }));

  try {
    await Promise.all(updates.map(u =>
      authFetch(`${API_BASE_URL}/api/onboarding/admin/tiers/${u.slug}`, {
        method: 'PUT',
        body: JSON.stringify({ display_order: u.display_order })
      })
    ));

    await loadAdminTiers();
  } catch (error) {
    console.error('Error reordering tiers:', error);
  }
}

async function reorderStarters(fromIndex, toIndex) {
  const sorted = [...adminStarterCharacters].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const [moved] = sorted.splice(fromIndex, 1);
  sorted.splice(toIndex, 0, moved);

  try {
    await authFetch(`${API_BASE_URL}/api/onboarding/admin/starter-order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order: sorted.map((c, idx) => ({ id: c.id, sort_order: idx }))
      })
    });

    await loadAdminCharacters();
  } catch (error) {
    console.error('Error reordering starters:', error);
  }
}

// ===========================================
// PREVIEW WIZARD
// ===========================================

function previewOnboardingWizard() {
  // Use the existing wizard preview functionality if available
  if (typeof showOnboardingWizard === 'function') {
    showOnboardingWizard('intro');
  } else {
    alert('Wizard preview not available. Make sure the onboarding wizard is loaded.');
  }
}
