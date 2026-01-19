// ===========================================
// ADMIN LANDING PAGE CMS
// ===========================================
// Depends on: config.js (API_BASE_URL, authFetch), utils.js (escapeHtml)
// Note: isUserAdmin is set by auth state handler in main script

// Admin landing page state
let adminLandingData = null;
let currentEditingSection = null;
let landingImageLibrary = [];
let selectedImageCallback = null;

// ===========================================
// MAIN ADMIN FUNCTIONS
// ===========================================

/**
 * Load all landing page content for admin editing
 */
async function loadAdminLandingContent() {
  if (!isUserAdmin) return;

  const container = document.getElementById('adminLandingContent');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 40px;">
      <div class="loading-spinner"></div>
      <p style="color: #888; margin-top: 12px;">Loading landing page content...</p>
    </div>
  `;

  try {
    const response = await authFetch(`${API_BASE_URL}/api/landing/admin/all`);
    if (!response.ok) throw new Error('Failed to load landing page content');

    adminLandingData = await response.json();
    console.log('📝 Admin landing data loaded:', adminLandingData);

    renderAdminLandingDashboard();
  } catch (error) {
    console.error('Error loading landing page content:', error);
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #ff4444;">
        <p>Failed to load landing page content.</p>
        <button class="landing-btn landing-btn--secondary" onclick="loadAdminLandingContent()" style="margin-top: 12px;">
          Retry
        </button>
      </div>
    `;
  }
}

/**
 * Render the admin landing page dashboard
 */
function renderAdminLandingDashboard() {
  const container = document.getElementById('adminLandingContent');
  if (!container || !adminLandingData) return;

  container.innerHTML = `
    <div class="admin-landing-header">
      <h2 style="margin: 0; font-size: 1.5rem; color: #fff;">Landing Page CMS</h2>
      <p style="color: #888; margin: 8px 0 0;">Edit your landing page content without code changes</p>
    </div>

    <div class="admin-landing-tabs" style="display: flex; gap: 8px; margin: 24px 0; flex-wrap: wrap;">
      <button class="admin-tab active" onclick="showAdminLandingTab('hero')" data-tab="hero">Hero</button>
      <button class="admin-tab" onclick="showAdminLandingTab('stats')" data-tab="stats">Stats</button>
      <button class="admin-tab" onclick="showAdminLandingTab('characters')" data-tab="characters">Characters</button>
      <button class="admin-tab" onclick="showAdminLandingTab('pipeline')" data-tab="pipeline">Pipeline</button>
      <button class="admin-tab" onclick="showAdminLandingTab('showcase')" data-tab="showcase">Showcase</button>
      <button class="admin-tab" onclick="showAdminLandingTab('capabilities')" data-tab="capabilities">Capabilities</button>
      <button class="admin-tab" onclick="showAdminLandingTab('education')" data-tab="education">Education</button>
      <button class="admin-tab" onclick="showAdminLandingTab('pricing')" data-tab="pricing">Pricing</button>
      <button class="admin-tab" onclick="showAdminLandingTab('finalcta')" data-tab="finalcta">Final CTA</button>
      <button class="admin-tab admin-tab--highlight" onclick="showAdminLandingTab('images')" data-tab="images">Image Library</button>
      <button class="admin-tab admin-tab--highlight" onclick="showAdminLandingTab('trial')" data-tab="trial">Trial Testing</button>
    </div>

    <div id="adminLandingTabContent">
      ${renderHeroSection()}
    </div>

    <!-- Image Picker Modal (always available) -->
    <div id="imagePickerModal" class="admin-modal" style="display: none;">
      <div class="admin-modal-content">
        <div class="admin-modal-header">
          <h3>Select an Image</h3>
          <button class="admin-btn-icon" onclick="closeImagePicker()">&times;</button>
        </div>
        <div class="admin-modal-body">
          <div class="admin-image-upload-zone admin-image-upload-zone--small" id="modalUploadZone">
            <input type="file" id="modalFileInput" accept="image/jpeg,image/png,image/webp,image/gif" style="display: none;">
            <div class="upload-zone-content" onclick="document.getElementById('modalFileInput').click()">
              <p>Upload New Image</p>
            </div>
          </div>
          <div id="modalImageGrid" class="admin-image-library-grid admin-image-library-grid--picker"></div>
        </div>
      </div>
    </div>
  `;

  // Add tab styles if not present
  addAdminLandingStyles();

  // Initialize upload handlers after a short delay to ensure DOM is ready
  setTimeout(initImageUploadHandlers, 100);
}

/**
 * Show a specific tab in the admin panel
 */
function showAdminLandingTab(tab) {
  // Update tab buttons
  document.querySelectorAll('.admin-landing-tabs .admin-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // Render tab content
  const contentContainer = document.getElementById('adminLandingTabContent');
  if (!contentContainer) return;

  switch (tab) {
    case 'hero':
      contentContainer.innerHTML = renderHeroSection();
      break;
    case 'stats':
      contentContainer.innerHTML = renderStatsSection();
      break;
    case 'characters':
      contentContainer.innerHTML = renderCharactersSection();
      break;
    case 'pipeline':
      contentContainer.innerHTML = renderPipelineSection();
      break;
    case 'showcase':
      contentContainer.innerHTML = renderShowcaseSection();
      break;
    case 'capabilities':
      contentContainer.innerHTML = renderCapabilitiesSection();
      break;
    case 'education':
      contentContainer.innerHTML = renderEducationSection();
      break;
    case 'pricing':
      contentContainer.innerHTML = renderPricingSection();
      break;
    case 'finalcta':
      contentContainer.innerHTML = renderFinalCtaSection();
      break;
    case 'images':
      contentContainer.innerHTML = renderImageLibrarySection();
      loadImageLibrary();
      // Initialize upload handlers after DOM is ready
      setTimeout(initImageUploadHandlers, 50);
      break;
    case 'trial':
      contentContainer.innerHTML = renderTrialTestingSection();
      break;
  }
}

// ===========================================
// SECTION RENDERERS
// ===========================================

function renderHeroSection() {
  const heroContent = adminLandingData.content?.filter(c => c.section_key === 'hero') || [];
  const getContent = (key) => heroContent.find(c => c.content_key === key)?.content_value || '';

  return `
    <div class="admin-section-card">
      <h3 class="admin-section-title">Hero Section</h3>

      <div class="admin-form-group">
        <label>Headline</label>
        <input type="text" id="heroHeadlineInput" value="${escapeHtml(getContent('headline'))}" class="admin-input">
      </div>

      <div class="admin-form-group">
        <label>Subheadline</label>
        <input type="text" id="heroSubheadlineInput" value="${escapeHtml(getContent('subheadline'))}" class="admin-input">
      </div>

      <div class="admin-form-row">
        <div class="admin-form-group">
          <label>Primary CTA Text</label>
          <input type="text" id="heroPrimaryCtaInput" value="${escapeHtml(getContent('primary_cta_text'))}" class="admin-input">
        </div>
        <div class="admin-form-group">
          <label>Primary CTA Link</label>
          <input type="text" id="heroPrimaryCtaLinkInput" value="${escapeHtml(getContent('primary_cta_link'))}" class="admin-input">
        </div>
      </div>

      <div class="admin-form-row">
        <div class="admin-form-group">
          <label>Secondary CTA Text</label>
          <input type="text" id="heroSecondaryCtaInput" value="${escapeHtml(getContent('secondary_cta_text'))}" class="admin-input">
        </div>
        <div class="admin-form-group">
          <label>Secondary CTA Link</label>
          <input type="text" id="heroSecondaryCtaLinkInput" value="${escapeHtml(getContent('secondary_cta_link'))}" class="admin-input">
        </div>
      </div>

      <div class="admin-form-group">
        <label>Trust Badge Text</label>
        <input type="text" id="heroTrustBadgeInput" value="${escapeHtml(getContent('trust_badge'))}" class="admin-input">
      </div>

      <button class="admin-save-btn" onclick="saveHeroSection()">Save Hero Section</button>
    </div>
  `;
}

function renderStatsSection() {
  const stats = adminLandingData.stats || [];

  return `
    <div class="admin-section-card">
      <h3 class="admin-section-title">Stats Bar</h3>
      <p style="color: #888; margin-bottom: 16px;">Social proof numbers displayed below the hero</p>

      <div id="statsListAdmin">
        ${stats.map((stat, index) => `
          <div class="admin-list-item" data-id="${stat.id}">
            <div class="admin-list-item-content">
              <input type="text" value="${escapeHtml(stat.icon)}" class="admin-input admin-input-icon" placeholder="Icon" data-field="icon">
              <input type="text" value="${escapeHtml(stat.value)}" class="admin-input" placeholder="Value (e.g. $2.4M+)" data-field="value">
              <input type="text" value="${escapeHtml(stat.label)}" class="admin-input" placeholder="Label" data-field="label">
            </div>
            <div class="admin-list-item-actions">
              <button class="admin-btn-icon" onclick="moveStatUp('${stat.id}')" title="Move Up">↑</button>
              <button class="admin-btn-icon" onclick="moveStatDown('${stat.id}')" title="Move Down">↓</button>
              <button class="admin-btn-icon admin-btn-danger" onclick="deleteStat('${stat.id}')" title="Delete">×</button>
            </div>
          </div>
        `).join('')}
      </div>

      <button class="admin-add-btn" onclick="addNewStat()">+ Add Stat</button>
      <button class="admin-save-btn" onclick="saveStatsSection()">Save Stats</button>
    </div>
  `;
}

function renderCharactersSection() {
  const characters = adminLandingData.characters || [];

  return `
    <div class="admin-section-card">
      <h3 class="admin-section-title">Featured Characters (Case Studies)</h3>
      <p style="color: #888; margin-bottom: 16px;">Showcase successful creator characters</p>

      <div id="charactersListAdmin">
        ${characters.map((char, index) => `
          <div class="admin-character-item" data-id="${char.id}">
            <div class="admin-character-preview">
              <img src="${char.image_url}" alt="${escapeHtml(char.name)}" style="width: 80px; height: 100px; object-fit: cover; border-radius: 8px;">
            </div>
            <div class="admin-character-fields">
              <div class="admin-form-row">
                <div class="admin-form-group">
                  <label>Name</label>
                  <input type="text" value="${escapeHtml(char.name)}" class="admin-input" data-field="name">
                </div>
                <div class="admin-form-group">
                  <label>Handle</label>
                  <input type="text" value="${escapeHtml(char.handle || '')}" class="admin-input" data-field="handle">
                </div>
              </div>
              <div class="admin-form-group">
                <label>Image</label>
                <div class="admin-input-with-button">
                  <input type="text" value="${escapeHtml(char.image_url)}" class="admin-input" data-field="image_url" placeholder="Image URL">
                  <button type="button" class="admin-upload-btn" onclick="openImagePickerForField(this, 'image_url')" title="Choose from library">📁</button>
                </div>
              </div>
              <div class="admin-form-group">
                <label>Metrics (JSON array)</label>
                <textarea class="admin-input admin-textarea" data-field="metrics">${typeof char.metrics === 'string' ? char.metrics : JSON.stringify(char.metrics, null, 2)}</textarea>
              </div>
              <div class="admin-form-row">
                <div class="admin-form-group">
                  <label>CTA Text</label>
                  <input type="text" value="${escapeHtml(char.cta_text || '')}" class="admin-input" data-field="cta_text">
                </div>
                <div class="admin-form-group">
                  <label>CTA Link</label>
                  <input type="text" value="${escapeHtml(char.cta_link || '')}" class="admin-input" data-field="cta_link">
                </div>
              </div>
            </div>
            <div class="admin-list-item-actions admin-vertical-actions">
              <button class="admin-btn-icon" onclick="moveCharacterUp('${char.id}')" title="Move Up">↑</button>
              <button class="admin-btn-icon" onclick="moveCharacterDown('${char.id}')" title="Move Down">↓</button>
              <button class="admin-btn-icon admin-btn-danger" onclick="deleteCharacter('${char.id}')" title="Delete">×</button>
            </div>
          </div>
        `).join('')}
      </div>

      <button class="admin-add-btn" onclick="addNewCharacter()">+ Add Character</button>
      <button class="admin-save-btn" onclick="saveCharactersSection()">Save Characters</button>
    </div>
  `;
}

function renderPipelineSection() {
  const pipeline = adminLandingData.pipeline || [];
  const pipelineContent = adminLandingData.content?.filter(c => c.section_key === 'pipeline') || [];
  const getContent = (key) => pipelineContent.find(c => c.content_key === key)?.content_value || '';

  return `
    <div class="admin-section-card">
      <h3 class="admin-section-title">Pipeline Steps</h3>

      <div class="admin-form-group">
        <label>Section Headline</label>
        <input type="text" id="pipelineHeadlineInput" value="${escapeHtml(getContent('headline'))}" class="admin-input">
      </div>

      <div id="pipelineListAdmin">
        ${pipeline.map((step, index) => `
          <div class="admin-list-item" data-id="${step.id}">
            <div class="admin-list-item-content">
              <input type="number" value="${step.step_number}" class="admin-input admin-input-number" placeholder="#" data-field="step_number" style="width: 60px;">
              <input type="text" value="${escapeHtml(step.icon)}" class="admin-input admin-input-icon" placeholder="Icon" data-field="icon">
              <input type="text" value="${escapeHtml(step.title)}" class="admin-input" placeholder="Title" data-field="title">
              <input type="text" value="${escapeHtml(step.description)}" class="admin-input admin-input-wide" placeholder="Description" data-field="description">
            </div>
            <div class="admin-list-item-actions">
              <button class="admin-btn-icon" onclick="movePipelineUp('${step.id}')" title="Move Up">↑</button>
              <button class="admin-btn-icon" onclick="movePipelineDown('${step.id}')" title="Move Down">↓</button>
              <button class="admin-btn-icon admin-btn-danger" onclick="deletePipelineStep('${step.id}')" title="Delete">×</button>
            </div>
          </div>
        `).join('')}
      </div>

      <button class="admin-add-btn" onclick="addNewPipelineStep()">+ Add Step</button>
      <button class="admin-save-btn" onclick="savePipelineSection()">Save Pipeline</button>
    </div>
  `;
}

function renderShowcaseSection() {
  const showcase = adminLandingData.showcase || [];
  const showcaseContent = adminLandingData.content?.filter(c => c.section_key === 'showcase') || [];
  const getContent = (key) => showcaseContent.find(c => c.content_key === key)?.content_value || '';

  return `
    <div class="admin-section-card">
      <h3 class="admin-section-title">Content Showcase</h3>

      <div class="admin-form-row">
        <div class="admin-form-group">
          <label>Section Headline</label>
          <input type="text" id="showcaseHeadlineInput" value="${escapeHtml(getContent('headline'))}" class="admin-input">
        </div>
        <div class="admin-form-group">
          <label>Section Subheadline</label>
          <input type="text" id="showcaseSubheadlineInput" value="${escapeHtml(getContent('subheadline'))}" class="admin-input">
        </div>
      </div>

      <div id="showcaseListAdmin" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin: 20px 0;">
        ${showcase.map((item, index) => `
          <div class="admin-showcase-item" data-id="${item.id}">
            <div class="admin-showcase-image-wrapper" onclick="openImagePickerForShowcase('${item.id}')">
              <img src="${item.image_url}" alt="${escapeHtml(item.caption || 'Showcase')}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px;">
              <div class="admin-showcase-image-overlay">Click to change</div>
            </div>
            <input type="text" value="${escapeHtml(item.image_url)}" class="admin-input" placeholder="Image URL" data-field="image_url" style="margin-top: 8px;">
            <input type="text" value="${escapeHtml(item.caption || '')}" class="admin-input" placeholder="Caption" data-field="caption">
            <select class="admin-input" data-field="size">
              <option value="small" ${item.size === 'small' ? 'selected' : ''}>Small</option>
              <option value="medium" ${item.size === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="large" ${item.size === 'large' ? 'selected' : ''}>Large</option>
            </select>
            <button class="admin-btn-icon admin-btn-danger" onclick="deleteShowcaseItem('${item.id}')" style="width: 100%; margin-top: 8px;">Delete</button>
          </div>
        `).join('')}
      </div>

      <button class="admin-add-btn" onclick="addNewShowcaseItem()">+ Add Showcase Image</button>
      <button class="admin-save-btn" onclick="saveShowcaseSection()">Save Showcase</button>
    </div>
  `;
}

function renderCapabilitiesSection() {
  const capabilities = adminLandingData.capabilities || [];
  const capContent = adminLandingData.content?.filter(c => c.section_key === 'capabilities') || [];
  const getContent = (key) => capContent.find(c => c.content_key === key)?.content_value || '';

  return `
    <div class="admin-section-card">
      <h3 class="admin-section-title">Capabilities</h3>

      <div class="admin-form-group">
        <label>Section Headline</label>
        <input type="text" id="capabilitiesHeadlineInput" value="${escapeHtml(getContent('headline'))}" class="admin-input">
      </div>

      <div id="capabilitiesListAdmin">
        ${capabilities.map((cap, index) => `
          <div class="admin-list-item" data-id="${cap.id}">
            <div class="admin-list-item-content">
              <input type="text" value="${escapeHtml(cap.icon)}" class="admin-input admin-input-icon" placeholder="Icon" data-field="icon">
              <input type="text" value="${escapeHtml(cap.title)}" class="admin-input" placeholder="Title" data-field="title">
              <input type="text" value="${escapeHtml(cap.description)}" class="admin-input admin-input-wide" placeholder="Description" data-field="description">
            </div>
            <div class="admin-list-item-actions">
              <button class="admin-btn-icon" onclick="moveCapabilityUp('${cap.id}')" title="Move Up">↑</button>
              <button class="admin-btn-icon" onclick="moveCapabilityDown('${cap.id}')" title="Move Down">↓</button>
              <button class="admin-btn-icon admin-btn-danger" onclick="deleteCapability('${cap.id}')" title="Delete">×</button>
            </div>
          </div>
        `).join('')}
      </div>

      <button class="admin-add-btn" onclick="addNewCapability()">+ Add Capability</button>
      <button class="admin-save-btn" onclick="saveCapabilitiesSection()">Save Capabilities</button>
    </div>
  `;
}

function renderEducationSection() {
  const eduContent = adminLandingData.content?.filter(c => c.section_key === 'education') || [];
  const getContent = (key) => eduContent.find(c => c.content_key === key)?.content_value || '';

  // Get all bullets
  const bullets = [];
  for (let i = 1; i <= 10; i++) {
    const bullet = getContent(`bullet_${i}`);
    if (bullet) bullets.push({ key: `bullet_${i}`, value: bullet });
  }

  return `
    <div class="admin-section-card">
      <h3 class="admin-section-title">Education Section</h3>

      <div class="admin-form-row">
        <div class="admin-form-group">
          <label>Headline</label>
          <input type="text" id="educationHeadlineInput" value="${escapeHtml(getContent('headline'))}" class="admin-input">
        </div>
        <div class="admin-form-group">
          <label>Subheadline</label>
          <input type="text" id="educationSubheadlineInput" value="${escapeHtml(getContent('subheadline'))}" class="admin-input">
        </div>
      </div>

      <div class="admin-form-group">
        <label>Bullet Points</label>
        <div id="educationBulletsList">
          ${bullets.map((b, i) => `
            <div class="admin-bullet-item" data-key="${b.key}">
              <input type="text" value="${escapeHtml(b.value)}" class="admin-input" placeholder="Bullet point ${i + 1}">
              <button class="admin-btn-icon admin-btn-danger" onclick="removeEducationBullet(this)">×</button>
            </div>
          `).join('')}
        </div>
        <button class="admin-add-btn" onclick="addEducationBullet()" style="margin-top: 8px;">+ Add Bullet</button>
      </div>

      <div class="admin-form-row">
        <div class="admin-form-group">
          <label>CTA Text</label>
          <input type="text" id="educationCtaInput" value="${escapeHtml(getContent('cta_text'))}" class="admin-input">
        </div>
        <div class="admin-form-group">
          <label>CTA Link</label>
          <input type="text" id="educationCtaLinkInput" value="${escapeHtml(getContent('cta_link'))}" class="admin-input">
        </div>
      </div>

      <button class="admin-save-btn" onclick="saveEducationSection()">Save Education Section</button>
    </div>
  `;
}

function renderPricingSection() {
  const pricingContent = adminLandingData.content?.filter(c => c.section_key === 'pricing') || [];
  const getContent = (key) => pricingContent.find(c => c.content_key === key)?.content_value || '';

  return `
    <div class="admin-section-card">
      <h3 class="admin-section-title">Pricing Section</h3>
      <p style="color: #888; margin-bottom: 16px;">Pricing tiers are managed in the payments settings. Here you can customize the section headline.</p>

      <div class="admin-form-group">
        <label>Section Headline</label>
        <input type="text" id="pricingHeadlineInput" value="${escapeHtml(getContent('headline'))}" class="admin-input">
      </div>

      <div class="admin-form-group">
        <label>Featured Tier (highlighted)</label>
        <select id="pricingFeaturedTierInput" class="admin-input">
          <option value="starter" ${getContent('featured_tier') === 'starter' ? 'selected' : ''}>Starter</option>
          <option value="creator" ${getContent('featured_tier') === 'creator' ? 'selected' : ''}>Creator</option>
          <option value="pro" ${getContent('featured_tier') === 'pro' ? 'selected' : ''}>Pro</option>
          <option value="mentorship" ${getContent('featured_tier') === 'mentorship' ? 'selected' : ''}>Mentorship</option>
        </select>
      </div>

      <button class="admin-save-btn" onclick="savePricingSection()">Save Pricing Section</button>
    </div>
  `;
}

function renderFinalCtaSection() {
  const ctaContent = adminLandingData.content?.filter(c => c.section_key === 'final_cta') || [];
  const getContent = (key) => ctaContent.find(c => c.content_key === key)?.content_value || '';

  return `
    <div class="admin-section-card">
      <h3 class="admin-section-title">Final Call to Action</h3>

      <div class="admin-form-group">
        <label>Headline</label>
        <input type="text" id="finalCtaHeadlineInput" value="${escapeHtml(getContent('headline'))}" class="admin-input">
      </div>

      <div class="admin-form-group">
        <label>Subheadline</label>
        <input type="text" id="finalCtaSubheadlineInput" value="${escapeHtml(getContent('subheadline'))}" class="admin-input">
      </div>

      <div class="admin-form-row">
        <div class="admin-form-group">
          <label>Primary CTA Text</label>
          <input type="text" id="finalCtaPrimaryInput" value="${escapeHtml(getContent('primary_cta_text'))}" class="admin-input">
        </div>
        <div class="admin-form-group">
          <label>Primary CTA Link</label>
          <input type="text" id="finalCtaPrimaryLinkInput" value="${escapeHtml(getContent('primary_cta_link'))}" class="admin-input">
        </div>
      </div>

      <div class="admin-form-row">
        <div class="admin-form-group">
          <label>Secondary CTA Text</label>
          <input type="text" id="finalCtaSecondaryInput" value="${escapeHtml(getContent('secondary_cta_text'))}" class="admin-input">
        </div>
        <div class="admin-form-group">
          <label>Secondary CTA Link</label>
          <input type="text" id="finalCtaSecondaryLinkInput" value="${escapeHtml(getContent('secondary_cta_link'))}" class="admin-input">
        </div>
      </div>

      <button class="admin-save-btn" onclick="saveFinalCtaSection()">Save Final CTA</button>
    </div>
  `;
}

// ===========================================
// TRIAL TESTING SECTION
// ===========================================

function renderTrialTestingSection() {
  const isEnabled = localStorage.getItem('trialAdminKey') ? true : false;

  return `
    <div class="admin-section-card">
      <h3 class="admin-section-title">Trial Testing Mode</h3>
      <p style="color: #888; margin-bottom: 20px;">
        Enable admin bypass to test the "Try It Now" feature without rate limits.
        This only affects your browser - real users are still rate limited.
      </p>

      <div style="background: ${isEnabled ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 68, 68, 0.1)'};
                  border: 1px solid ${isEnabled ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 68, 68, 0.3)'};
                  border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="font-size: 1.1rem; font-weight: 600; color: ${isEnabled ? '#00ff88' : '#ff4444'};">
              ${isEnabled ? '✓ Admin Bypass Enabled' : '✗ Admin Bypass Disabled'}
            </div>
            <div style="color: #888; font-size: 0.9rem; margin-top: 4px;">
              ${isEnabled ? 'You can test unlimited trial generations' : 'You are subject to normal rate limits'}
            </div>
          </div>
          <button
            class="admin-btn ${isEnabled ? 'admin-btn--danger' : 'admin-btn--primary'}"
            onclick="toggleTrialAdminBypass()"
            style="min-width: 120px;"
          >
            ${isEnabled ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>

      <div class="admin-form-group">
        <label>Admin Key</label>
        <p style="color: #666; font-size: 0.85rem; margin: 4px 0 8px;">
          Enter the TRIAL_ADMIN_KEY from your server environment to enable bypass.
        </p>
        <input
          type="password"
          id="trialAdminKeyInput"
          class="admin-input"
          placeholder="Enter your TRIAL_ADMIN_KEY"
          value="${localStorage.getItem('trialAdminKey') || ''}"
        >
      </div>

      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
        <h4 style="margin: 0 0 12px; color: #fff;">Quick Actions</h4>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <button class="admin-btn admin-btn--secondary" onclick="testTrialGeneration()">
            Test Generation
          </button>
          <button class="admin-btn admin-btn--secondary" onclick="resetAllTrials()">
            Reset All Trials
          </button>
          <button class="admin-btn admin-btn--secondary" onclick="viewTrialStatus()">
            View Status
          </button>
        </div>
      </div>

      <div id="trialTestOutput" style="margin-top: 20px; display: none;">
        <pre style="background: #1a1a2e; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 0.85rem; color: #00ff88;"></pre>
      </div>
    </div>
  `;
}

function toggleTrialAdminBypass() {
  const input = document.getElementById('trialAdminKeyInput');
  const currentKey = localStorage.getItem('trialAdminKey');

  if (currentKey) {
    // Disable - remove key
    localStorage.removeItem('trialAdminKey');
    showToast('Trial admin bypass disabled', 'info');
  } else {
    // Enable - save key
    const key = input?.value?.trim();
    if (!key) {
      showToast('Please enter your admin key first', 'error');
      input?.focus();
      return;
    }
    localStorage.setItem('trialAdminKey', key);
    showToast('Trial admin bypass enabled!', 'success');
  }

  // Re-render the section
  showAdminLandingTab('trial');
}

async function testTrialGeneration() {
  const outputDiv = document.getElementById('trialTestOutput');
  const outputPre = outputDiv?.querySelector('pre');
  if (!outputDiv || !outputPre) return;

  outputDiv.style.display = 'block';
  outputPre.textContent = 'Testing trial generation...';

  try {
    const headers = { 'Content-Type': 'application/json' };
    const adminKey = localStorage.getItem('trialAdminKey');
    if (adminKey) {
      headers['Authorization'] = `Bearer ${adminKey}`;
    }

    const response = await fetch('/api/trial/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: 'smiling, casual outfit, sunny day',
        fingerprint: 'admin-test-' + Date.now()
      })
    });

    const data = await response.json();
    outputPre.textContent = JSON.stringify(data, null, 2);
    outputPre.style.color = response.ok ? '#00ff88' : '#ff4444';

    if (response.ok) {
      showToast('Test generation successful!', 'success');
    } else {
      showToast(data.error || 'Generation failed', 'error');
    }
  } catch (error) {
    outputPre.textContent = 'Error: ' + error.message;
    outputPre.style.color = '#ff4444';
    showToast('Test failed: ' + error.message, 'error');
  }
}

async function resetAllTrials() {
  const adminKey = localStorage.getItem('trialAdminKey');
  if (!adminKey) {
    showToast('Enable admin bypass first', 'error');
    return;
  }

  const outputDiv = document.getElementById('trialTestOutput');
  const outputPre = outputDiv?.querySelector('pre');
  if (outputDiv && outputPre) {
    outputDiv.style.display = 'block';
    outputPre.textContent = 'Resetting all trials...';
  }

  try {
    const response = await fetch('/api/trial/admin/reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminKey}`
      },
      body: JSON.stringify({ clearAll: true })
    });

    const data = await response.json();
    if (outputPre) {
      outputPre.textContent = JSON.stringify(data, null, 2);
      outputPre.style.color = response.ok ? '#00ff88' : '#ff4444';
    }

    if (response.ok) {
      showToast(`Cleared ${data.deletedCount} trial record(s)`, 'success');
    } else {
      showToast(data.error || 'Reset failed', 'error');
    }
  } catch (error) {
    if (outputPre) {
      outputPre.textContent = 'Error: ' + error.message;
      outputPre.style.color = '#ff4444';
    }
    showToast('Reset failed: ' + error.message, 'error');
  }
}

async function viewTrialStatus() {
  const adminKey = localStorage.getItem('trialAdminKey');
  if (!adminKey) {
    showToast('Enable admin bypass first', 'error');
    return;
  }

  const outputDiv = document.getElementById('trialTestOutput');
  const outputPre = outputDiv?.querySelector('pre');
  if (outputDiv && outputPre) {
    outputDiv.style.display = 'block';
    outputPre.textContent = 'Fetching trial status...';
  }

  try {
    const response = await fetch('/api/trial/admin/status', {
      headers: {
        'Authorization': `Bearer ${adminKey}`
      }
    });

    const data = await response.json();
    if (outputPre) {
      outputPre.textContent = JSON.stringify(data, null, 2);
      outputPre.style.color = response.ok ? '#00ff88' : '#ff4444';
    }

    if (!response.ok) {
      showToast(data.error || 'Failed to get status', 'error');
    }
  } catch (error) {
    if (outputPre) {
      outputPre.textContent = 'Error: ' + error.message;
      outputPre.style.color = '#ff4444';
    }
    showToast('Failed: ' + error.message, 'error');
  }
}

// ===========================================
// IMAGE LIBRARY SECTION
// ===========================================

function renderImageLibrarySection() {
  return `
    <div class="admin-section-card">
      <h3 class="admin-section-title">Image Library</h3>
      <p style="color: #888; margin-bottom: 16px;">Upload and manage images for your landing page. Click an image to copy its URL.</p>

      <div class="admin-image-upload-zone" id="imageUploadZone">
        <input type="file" id="imageFileInput" accept="image/jpeg,image/png,image/webp,image/gif" multiple style="display: none;">
        <div class="upload-zone-content" onclick="document.getElementById('imageFileInput').click()">
          <div class="upload-icon">📁</div>
          <p>Click to upload or drag & drop images here</p>
          <span class="upload-hint">JPEG, PNG, WebP, GIF - Max 5MB each</span>
        </div>
      </div>

      <div class="admin-image-filters" style="display: flex; gap: 12px; margin: 20px 0; flex-wrap: wrap;">
        <select id="imageContextFilter" class="admin-input" style="width: auto;" onchange="filterImageLibrary()">
          <option value="">All Images</option>
          <option value="character">Characters</option>
          <option value="showcase">Showcase</option>
          <option value="hero">Hero</option>
          <option value="general">General</option>
        </select>
        <span id="imageLibraryCount" style="color: #888; align-self: center;">0 images</span>
      </div>

      <div id="imageLibraryGrid" class="admin-image-library-grid">
        <div style="text-align: center; padding: 40px; color: #888;">
          <div class="loading-spinner"></div>
          <p style="margin-top: 12px;">Loading images...</p>
        </div>
      </div>
    </div>
  `;
}

async function loadImageLibrary() {
  try {
    const contextFilter = document.getElementById('imageContextFilter')?.value || '';
    const url = `${API_BASE_URL}/api/landing/admin/images${contextFilter ? `?context=${contextFilter}` : ''}`;

    const response = await authFetch(url);
    if (!response.ok) throw new Error('Failed to load images');

    const data = await response.json();
    landingImageLibrary = data.images || [];

    renderImageLibraryGrid();

    const countEl = document.getElementById('imageLibraryCount');
    if (countEl) countEl.textContent = `${data.total || landingImageLibrary.length} images`;

  } catch (error) {
    console.error('Error loading image library:', error);
    const grid = document.getElementById('imageLibraryGrid');
    if (grid) {
      grid.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #ff4444;">
          <p>Failed to load images</p>
          <button class="admin-add-btn" onclick="loadImageLibrary()" style="width: auto; margin-top: 12px;">Retry</button>
        </div>
      `;
    }
  }
}

function renderImageLibraryGrid() {
  const grid = document.getElementById('imageLibraryGrid');
  if (!grid) return;

  if (landingImageLibrary.length === 0) {
    grid.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #888; grid-column: 1 / -1;">
        <p>No images uploaded yet</p>
        <p style="font-size: 0.9rem; margin-top: 8px;">Upload your first image above</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = landingImageLibrary.map(img => `
    <div class="admin-image-card" data-id="${img.id}">
      <img src="${img.public_url}" alt="${escapeHtml(img.alt_text || img.original_filename)}" loading="lazy">
      <div class="admin-image-card-overlay">
        <button class="admin-image-btn" onclick="copyImageUrl('${img.public_url}')" title="Copy URL">📋</button>
        <button class="admin-image-btn" onclick="editImageMetadata('${img.id}')" title="Edit">✏️</button>
        <button class="admin-image-btn admin-btn-danger" onclick="deleteLibraryImage('${img.id}')" title="Delete">🗑️</button>
      </div>
      <div class="admin-image-card-info">
        <span class="admin-image-filename">${escapeHtml(img.original_filename)}</span>
        <span class="admin-image-context">${img.usage_context || 'general'}</span>
      </div>
    </div>
  `).join('');
}

function filterImageLibrary() {
  loadImageLibrary();
}

async function uploadLandingImage(file, context = 'general') {
  return new Promise((resolve, reject) => {
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('File too large (max 5MB)'));
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      reject(new Error('Invalid file type'));
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const response = await authFetch(`${API_BASE_URL}/api/landing/admin/images/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_data: e.target.result,
            filename: file.name,
            usage_context: context
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Upload failed');
        }

        const result = await response.json();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function initImageUploadHandlers() {
  // Main upload zone
  const uploadZone = document.getElementById('imageUploadZone');
  const fileInput = document.getElementById('imageFileInput');

  if (uploadZone && fileInput) {
    // Drag & drop
    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
      uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      uploadZone.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      await handleImageUploads(files);
    });

    // File input change
    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      await handleImageUploads(files);
      fileInput.value = '';
    });
  }

  // Modal upload zone
  const modalFileInput = document.getElementById('modalFileInput');
  if (modalFileInput) {
    modalFileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        await handleImageUploads(files, true);
      }
      modalFileInput.value = '';
    });
  }
}

async function handleImageUploads(files, isModal = false) {
  if (files.length === 0) return;

  const context = document.getElementById('imageContextFilter')?.value || 'general';

  showAdminToast(`Uploading ${files.length} image${files.length > 1 ? 's' : ''}...`);

  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    try {
      const result = await uploadLandingImage(file, context);
      successCount++;

      // If in picker mode and callback exists, use the first uploaded image
      if (isModal && selectedImageCallback && successCount === 1) {
        selectedImageCallback(result.url);
        closeImagePicker();
      }
    } catch (error) {
      console.error('Upload failed:', file.name, error);
      failCount++;
    }
  }

  if (successCount > 0) {
    showAdminToast(`${successCount} image${successCount > 1 ? 's' : ''} uploaded!`);
    loadImageLibrary();
    if (isModal) loadPickerImages();
  }

  if (failCount > 0) {
    showAdminToast(`${failCount} upload${failCount > 1 ? 's' : ''} failed`, 'error');
  }
}

function copyImageUrl(url) {
  navigator.clipboard.writeText(url).then(() => {
    showAdminToast('URL copied to clipboard!');
  }).catch(() => {
    showAdminToast('Failed to copy URL', 'error');
  });
}

async function editImageMetadata(imageId) {
  const image = landingImageLibrary.find(img => img.id === imageId);
  if (!image) return;

  const altText = prompt('Alt text for this image:', image.alt_text || '');
  if (altText === null) return;

  const context = prompt('Usage context (character, showcase, hero, general):', image.usage_context || 'general');
  if (context === null) return;

  try {
    await authFetch(`${API_BASE_URL}/api/landing/admin/images/${imageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alt_text: altText, usage_context: context })
    });

    showAdminToast('Image updated!');
    loadImageLibrary();
  } catch (error) {
    showAdminToast('Failed to update image', 'error');
  }
}

async function deleteLibraryImage(imageId) {
  if (!confirm('Delete this image? This cannot be undone.')) return;

  try {
    await authFetch(`${API_BASE_URL}/api/landing/admin/images/${imageId}`, { method: 'DELETE' });
    showAdminToast('Image deleted');
    loadImageLibrary();
  } catch (error) {
    showAdminToast('Failed to delete image', 'error');
  }
}

// ===========================================
// IMAGE PICKER MODAL
// ===========================================

function openImagePicker(callback) {
  selectedImageCallback = callback;
  const modal = document.getElementById('imagePickerModal');
  if (modal) {
    modal.style.display = 'flex';
    loadPickerImages();
  }
}

function closeImagePicker() {
  const modal = document.getElementById('imagePickerModal');
  if (modal) {
    modal.style.display = 'none';
  }
  selectedImageCallback = null;
}

async function loadPickerImages() {
  const grid = document.getElementById('modalImageGrid');
  if (!grid) return;

  grid.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';

  try {
    const response = await authFetch(`${API_BASE_URL}/api/landing/admin/images?limit=100`);
    if (!response.ok) throw new Error('Failed to load images');

    const data = await response.json();
    const images = data.images || [];

    if (images.length === 0) {
      grid.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">No images. Upload one above.</div>';
      return;
    }

    grid.innerHTML = images.map(img => `
      <div class="admin-image-card admin-image-card--selectable" onclick="selectPickerImage('${img.public_url}')">
        <img src="${img.public_url}" alt="${escapeHtml(img.alt_text || img.original_filename)}" loading="lazy">
      </div>
    `).join('');

  } catch (error) {
    grid.innerHTML = '<div style="text-align: center; padding: 20px; color: #ff4444;">Failed to load images</div>';
  }
}

function selectPickerImage(url) {
  if (selectedImageCallback) {
    selectedImageCallback(url);
    closeImagePicker();
  }
}

function openImagePickerForField(button, fieldName) {
  const container = button.closest('.admin-character-item') || button.closest('.admin-showcase-item');
  if (!container) return;

  const input = container.querySelector(`[data-field="${fieldName}"]`);
  if (!input) return;

  const itemId = container.dataset.id;
  const isCharacter = container.classList.contains('admin-character-item');

  openImagePicker(async (url) => {
    input.value = url;
    // Update preview if exists
    const preview = container.querySelector('.admin-character-preview img, .admin-showcase-image-wrapper img');
    if (preview) preview.src = url;

    // Auto-save the item
    if (itemId && itemId !== 'new') {
      try {
        if (isCharacter) {
          // Save character
          let metrics = container.querySelector('[data-field="metrics"]')?.value || '[]';
          try { metrics = JSON.parse(metrics); } catch { metrics = []; }

          const data = {
            name: container.querySelector('[data-field="name"]')?.value,
            handle: container.querySelector('[data-field="handle"]')?.value,
            image_url: url,
            metrics: metrics,
            cta_text: container.querySelector('[data-field="cta_text"]')?.value,
            cta_link: container.querySelector('[data-field="cta_link"]')?.value
          };

          await authFetch(`${API_BASE_URL}/api/landing/admin/characters/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
        }
        showAdminToast('Image updated!');
      } catch (error) {
        console.error('Failed to save image:', error);
        showAdminToast('Failed to save image', 'error');
      }
    }
  });
}

async function openImagePickerForShowcase(itemId) {
  const container = document.querySelector(`.admin-showcase-item[data-id="${itemId}"]`);
  if (!container) return;

  const input = container.querySelector('[data-field="image_url"]');
  const preview = container.querySelector('.admin-showcase-image-wrapper img');

  openImagePicker(async (url) => {
    if (input) input.value = url;
    if (preview) preview.src = url;

    // Auto-save the showcase item
    try {
      const data = {
        image_url: url,
        caption: container.querySelector('[data-field="caption"]')?.value,
        size: container.querySelector('[data-field="size"]')?.value
      };

      await authFetch(`${API_BASE_URL}/api/landing/admin/showcase/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      showAdminToast('Image updated!');
    } catch (error) {
      console.error('Failed to save showcase image:', error);
      showAdminToast('Failed to save image', 'error');
    }
  });
}

// ===========================================
// SAVE FUNCTIONS
// ===========================================

async function saveHeroSection() {
  const updates = [
    { section_key: 'hero', content_key: 'headline', content_value: document.getElementById('heroHeadlineInput')?.value },
    { section_key: 'hero', content_key: 'subheadline', content_value: document.getElementById('heroSubheadlineInput')?.value },
    { section_key: 'hero', content_key: 'primary_cta_text', content_value: document.getElementById('heroPrimaryCtaInput')?.value },
    { section_key: 'hero', content_key: 'primary_cta_link', content_value: document.getElementById('heroPrimaryCtaLinkInput')?.value },
    { section_key: 'hero', content_key: 'secondary_cta_text', content_value: document.getElementById('heroSecondaryCtaInput')?.value },
    { section_key: 'hero', content_key: 'secondary_cta_link', content_value: document.getElementById('heroSecondaryCtaLinkInput')?.value },
    { section_key: 'hero', content_key: 'trust_badge', content_value: document.getElementById('heroTrustBadgeInput')?.value }
  ];

  await saveContentUpdates(updates);
}

async function saveStatsSection() {
  const statsItems = document.querySelectorAll('#statsListAdmin .admin-list-item');
  const updates = [];

  for (const item of statsItems) {
    const id = item.dataset.id;
    const data = {
      icon: item.querySelector('[data-field="icon"]')?.value,
      value: item.querySelector('[data-field="value"]')?.value,
      label: item.querySelector('[data-field="label"]')?.value
    };

    if (id && id !== 'new') {
      await authFetch(`${API_BASE_URL}/api/landing/admin/stats/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }
  }

  showAdminToast('Stats saved successfully!');
  loadAdminLandingContent();
}

async function saveCharactersSection() {
  const characterItems = document.querySelectorAll('#charactersListAdmin .admin-character-item');

  for (const item of characterItems) {
    const id = item.dataset.id;
    let metrics = item.querySelector('[data-field="metrics"]')?.value;

    try {
      metrics = JSON.parse(metrics);
    } catch (e) {
      showAdminToast('Invalid JSON in metrics field', 'error');
      return;
    }

    const data = {
      name: item.querySelector('[data-field="name"]')?.value,
      handle: item.querySelector('[data-field="handle"]')?.value,
      image_url: item.querySelector('[data-field="image_url"]')?.value,
      metrics: metrics,
      cta_text: item.querySelector('[data-field="cta_text"]')?.value,
      cta_link: item.querySelector('[data-field="cta_link"]')?.value
    };

    if (id && id !== 'new') {
      await authFetch(`${API_BASE_URL}/api/landing/admin/characters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }
  }

  showAdminToast('Characters saved successfully!');
  loadAdminLandingContent();
}

async function savePipelineSection() {
  // Save headline
  await saveContentUpdates([
    { section_key: 'pipeline', content_key: 'headline', content_value: document.getElementById('pipelineHeadlineInput')?.value }
  ]);

  const pipelineItems = document.querySelectorAll('#pipelineListAdmin .admin-list-item');

  for (const item of pipelineItems) {
    const id = item.dataset.id;
    const data = {
      step_number: parseInt(item.querySelector('[data-field="step_number"]')?.value) || 1,
      icon: item.querySelector('[data-field="icon"]')?.value,
      title: item.querySelector('[data-field="title"]')?.value,
      description: item.querySelector('[data-field="description"]')?.value
    };

    if (id && id !== 'new') {
      await authFetch(`${API_BASE_URL}/api/landing/admin/pipeline/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }
  }

  showAdminToast('Pipeline saved successfully!');
  loadAdminLandingContent();
}

async function saveShowcaseSection() {
  // Save headlines
  await saveContentUpdates([
    { section_key: 'showcase', content_key: 'headline', content_value: document.getElementById('showcaseHeadlineInput')?.value },
    { section_key: 'showcase', content_key: 'subheadline', content_value: document.getElementById('showcaseSubheadlineInput')?.value }
  ]);

  const showcaseItems = document.querySelectorAll('#showcaseListAdmin .admin-showcase-item');

  for (const item of showcaseItems) {
    const id = item.dataset.id;
    const data = {
      image_url: item.querySelector('[data-field="image_url"]')?.value,
      caption: item.querySelector('[data-field="caption"]')?.value,
      size: item.querySelector('[data-field="size"]')?.value
    };

    if (id && id !== 'new') {
      await authFetch(`${API_BASE_URL}/api/landing/admin/showcase/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }
  }

  showAdminToast('Showcase saved successfully!');
  loadAdminLandingContent();
}

async function saveCapabilitiesSection() {
  // Save headline
  await saveContentUpdates([
    { section_key: 'capabilities', content_key: 'headline', content_value: document.getElementById('capabilitiesHeadlineInput')?.value }
  ]);

  const capItems = document.querySelectorAll('#capabilitiesListAdmin .admin-list-item');

  for (const item of capItems) {
    const id = item.dataset.id;
    const data = {
      icon: item.querySelector('[data-field="icon"]')?.value,
      title: item.querySelector('[data-field="title"]')?.value,
      description: item.querySelector('[data-field="description"]')?.value
    };

    if (id && id !== 'new') {
      await authFetch(`${API_BASE_URL}/api/landing/admin/capabilities/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }
  }

  showAdminToast('Capabilities saved successfully!');
  loadAdminLandingContent();
}

async function saveEducationSection() {
  const bullets = [];
  document.querySelectorAll('#educationBulletsList .admin-bullet-item input').forEach((input, i) => {
    if (input.value.trim()) {
      bullets.push({ section_key: 'education', content_key: `bullet_${i + 1}`, content_value: input.value.trim() });
    }
  });

  const updates = [
    { section_key: 'education', content_key: 'headline', content_value: document.getElementById('educationHeadlineInput')?.value },
    { section_key: 'education', content_key: 'subheadline', content_value: document.getElementById('educationSubheadlineInput')?.value },
    { section_key: 'education', content_key: 'cta_text', content_value: document.getElementById('educationCtaInput')?.value },
    { section_key: 'education', content_key: 'cta_link', content_value: document.getElementById('educationCtaLinkInput')?.value },
    ...bullets
  ];

  await saveContentUpdates(updates);
}

async function savePricingSection() {
  const updates = [
    { section_key: 'pricing', content_key: 'headline', content_value: document.getElementById('pricingHeadlineInput')?.value },
    { section_key: 'pricing', content_key: 'featured_tier', content_value: document.getElementById('pricingFeaturedTierInput')?.value }
  ];

  await saveContentUpdates(updates);
}

async function saveFinalCtaSection() {
  const updates = [
    { section_key: 'final_cta', content_key: 'headline', content_value: document.getElementById('finalCtaHeadlineInput')?.value },
    { section_key: 'final_cta', content_key: 'subheadline', content_value: document.getElementById('finalCtaSubheadlineInput')?.value },
    { section_key: 'final_cta', content_key: 'primary_cta_text', content_value: document.getElementById('finalCtaPrimaryInput')?.value },
    { section_key: 'final_cta', content_key: 'primary_cta_link', content_value: document.getElementById('finalCtaPrimaryLinkInput')?.value },
    { section_key: 'final_cta', content_key: 'secondary_cta_text', content_value: document.getElementById('finalCtaSecondaryInput')?.value },
    { section_key: 'final_cta', content_key: 'secondary_cta_link', content_value: document.getElementById('finalCtaSecondaryLinkInput')?.value }
  ];

  await saveContentUpdates(updates);
}

async function saveContentUpdates(updates) {
  try {
    for (const update of updates) {
      // Find existing content item
      const existing = adminLandingData.content?.find(c =>
        c.section_key === update.section_key && c.content_key === update.content_key
      );

      if (existing) {
        await authFetch(`${API_BASE_URL}/api/landing/admin/content/${existing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content_value: update.content_value })
        });
      } else {
        await authFetch(`${API_BASE_URL}/api/landing/admin/content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            section_key: update.section_key,
            content_key: update.content_key,
            content_value: update.content_value,
            content_type: 'text'
          })
        });
      }
    }
    // Note: Don't call loadAdminLandingContent() here - let the calling function do it
    // after all saves are complete, otherwise the DOM gets re-rendered mid-save
  } catch (error) {
    console.error('Error saving content:', error);
    showAdminToast('Failed to save content', 'error');
  }
}

// ===========================================
// ADD/DELETE FUNCTIONS
// ===========================================

async function addNewStat() {
  try {
    await authFetch(`${API_BASE_URL}/api/landing/admin/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value: 'New',
        label: 'New Stat',
        icon: '📊',
        display_order: (adminLandingData.stats?.length || 0) + 1
      })
    });
    loadAdminLandingContent();
  } catch (error) {
    showAdminToast('Failed to add stat', 'error');
  }
}

async function deleteStat(id) {
  if (!confirm('Delete this stat?')) return;
  try {
    await authFetch(`${API_BASE_URL}/api/landing/admin/stats/${id}`, { method: 'DELETE' });
    loadAdminLandingContent();
  } catch (error) {
    showAdminToast('Failed to delete stat', 'error');
  }
}

async function addNewCharacter() {
  try {
    await authFetch(`${API_BASE_URL}/api/landing/admin/characters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New Character',
        handle: '@newcharacter',
        image_url: 'https://placehold.co/400x500/1a1a2e/ff2ebb?text=New',
        metrics: [{ icon: '📸', value: '0', label: 'Followers' }],
        display_order: (adminLandingData.characters?.length || 0) + 1
      })
    });
    loadAdminLandingContent();
  } catch (error) {
    showAdminToast('Failed to add character', 'error');
  }
}

async function deleteCharacter(id) {
  if (!confirm('Delete this character?')) return;
  try {
    await authFetch(`${API_BASE_URL}/api/landing/admin/characters/${id}`, { method: 'DELETE' });
    loadAdminLandingContent();
  } catch (error) {
    showAdminToast('Failed to delete character', 'error');
  }
}

async function addNewPipelineStep() {
  try {
    await authFetch(`${API_BASE_URL}/api/landing/admin/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step_number: (adminLandingData.pipeline?.length || 0) + 1,
        title: 'New Step',
        description: 'Description',
        icon: '✨',
        display_order: (adminLandingData.pipeline?.length || 0) + 1
      })
    });
    loadAdminLandingContent();
  } catch (error) {
    showAdminToast('Failed to add pipeline step', 'error');
  }
}

async function deletePipelineStep(id) {
  if (!confirm('Delete this pipeline step?')) return;
  try {
    await authFetch(`${API_BASE_URL}/api/landing/admin/pipeline/${id}`, { method: 'DELETE' });
    loadAdminLandingContent();
  } catch (error) {
    showAdminToast('Failed to delete pipeline step', 'error');
  }
}

async function addNewCapability() {
  try {
    await authFetch(`${API_BASE_URL}/api/landing/admin/capabilities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        icon: '✨',
        title: 'New Capability',
        description: 'Description',
        display_order: (adminLandingData.capabilities?.length || 0) + 1
      })
    });
    loadAdminLandingContent();
  } catch (error) {
    showAdminToast('Failed to add capability', 'error');
  }
}

async function deleteCapability(id) {
  if (!confirm('Delete this capability?')) return;
  try {
    await authFetch(`${API_BASE_URL}/api/landing/admin/capabilities/${id}`, { method: 'DELETE' });
    loadAdminLandingContent();
  } catch (error) {
    showAdminToast('Failed to delete capability', 'error');
  }
}

async function addNewShowcaseItem() {
  try {
    await authFetch(`${API_BASE_URL}/api/landing/admin/showcase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: 'https://placehold.co/400x400/1a1a2e/ff2ebb?text=New',
        caption: 'New Image',
        size: 'medium',
        display_order: (adminLandingData.showcase?.length || 0) + 1
      })
    });
    loadAdminLandingContent();
  } catch (error) {
    showAdminToast('Failed to add showcase item', 'error');
  }
}

async function deleteShowcaseItem(id) {
  if (!confirm('Delete this showcase item?')) return;
  try {
    await authFetch(`${API_BASE_URL}/api/landing/admin/showcase/${id}`, { method: 'DELETE' });
    loadAdminLandingContent();
  } catch (error) {
    showAdminToast('Failed to delete showcase item', 'error');
  }
}

function addEducationBullet() {
  const container = document.getElementById('educationBulletsList');
  const count = container.querySelectorAll('.admin-bullet-item').length + 1;
  const div = document.createElement('div');
  div.className = 'admin-bullet-item';
  div.dataset.key = `bullet_${count}`;
  div.innerHTML = `
    <input type="text" value="" class="admin-input" placeholder="Bullet point ${count}">
    <button class="admin-btn-icon admin-btn-danger" onclick="removeEducationBullet(this)">×</button>
  `;
  container.appendChild(div);
}

function removeEducationBullet(btn) {
  btn.parentElement.remove();
}

// ===========================================
// MOVE FUNCTIONS (Reordering)
// ===========================================

async function moveStatUp(id) { await moveItem('stats', id, -1); }
async function moveStatDown(id) { await moveItem('stats', id, 1); }
async function moveCharacterUp(id) { await moveItem('characters', id, -1); }
async function moveCharacterDown(id) { await moveItem('characters', id, 1); }
async function movePipelineUp(id) { await moveItem('pipeline', id, -1); }
async function movePipelineDown(id) { await moveItem('pipeline', id, 1); }
async function moveCapabilityUp(id) { await moveItem('capabilities', id, -1); }
async function moveCapabilityDown(id) { await moveItem('capabilities', id, 1); }

async function moveItem(type, id, direction) {
  const tableMap = {
    stats: 'landing_stats',
    characters: 'landing_characters',
    pipeline: 'landing_pipeline_steps',
    capabilities: 'landing_capabilities'
  };

  const items = adminLandingData[type];
  const index = items.findIndex(item => item.id === id);
  const newIndex = index + direction;

  if (newIndex < 0 || newIndex >= items.length) return;

  // Swap display_order
  const order = items.map((item, i) => ({
    id: item.id,
    display_order: i === index ? newIndex + 1 : i === newIndex ? index + 1 : i + 1
  }));

  try {
    await authFetch(`${API_BASE_URL}/api/landing/admin/reorder/${tableMap[type]}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order })
    });
    loadAdminLandingContent();
  } catch (error) {
    showAdminToast('Failed to reorder items', 'error');
  }
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

function showAdminToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `admin-toast admin-toast--${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === 'error' ? '#ff4444' : '#4ade80'};
    color: white;
    border-radius: 8px;
    font-weight: 500;
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function addAdminLandingStyles() {
  if (document.getElementById('adminLandingStyles')) return;

  const style = document.createElement('style');
  style.id = 'adminLandingStyles';
  style.textContent = `
    .admin-landing-tabs .admin-tab {
      padding: 10px 20px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.2s;
    }
    .admin-landing-tabs .admin-tab:hover {
      border-color: var(--accent-primary);
      color: var(--text-primary);
    }
    .admin-landing-tabs .admin-tab.active {
      background: var(--accent-gradient);
      border-color: transparent;
      color: white;
    }
    .admin-section-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
    }
    .admin-section-title {
      font-size: 1.2rem;
      margin: 0 0 20px;
      color: var(--text-primary);
    }
    .admin-form-group {
      margin-bottom: 16px;
    }
    .admin-form-group label {
      display: block;
      color: var(--text-secondary);
      font-size: 0.9rem;
      margin-bottom: 6px;
    }
    .admin-form-row {
      display: flex;
      gap: 16px;
    }
    .admin-form-row .admin-form-group {
      flex: 1;
    }
    .admin-input {
      width: 100%;
      padding: 10px 14px;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 0.95rem;
    }
    .admin-input:focus {
      outline: none;
      border-color: var(--accent-primary);
    }
    .admin-input-icon {
      width: 60px !important;
      text-align: center;
    }
    .admin-input-number {
      width: 70px !important;
    }
    .admin-input-wide {
      flex: 2 !important;
    }
    .admin-textarea {
      min-height: 100px;
      resize: vertical;
      font-family: monospace;
    }
    .admin-list-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--bg-tertiary);
      border-radius: 8px;
      margin-bottom: 8px;
    }
    .admin-list-item-content {
      display: flex;
      gap: 8px;
      flex: 1;
      flex-wrap: wrap;
    }
    .admin-list-item-content .admin-input {
      flex: 1;
      min-width: 120px;
    }
    .admin-list-item-actions {
      display: flex;
      gap: 4px;
    }
    .admin-vertical-actions {
      flex-direction: column;
    }
    .admin-btn-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-hover);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.2s;
    }
    .admin-btn-icon:hover {
      background: var(--accent-primary);
      color: white;
      border-color: var(--accent-primary);
    }
    .admin-btn-danger:hover {
      background: #ff4444 !important;
      border-color: #ff4444 !important;
    }
    .admin-add-btn {
      padding: 10px 20px;
      background: var(--bg-hover);
      border: 1px dashed var(--border-color);
      border-radius: 8px;
      color: var(--text-secondary);
      cursor: pointer;
      width: 100%;
      margin: 12px 0;
      transition: all 0.2s;
    }
    .admin-add-btn:hover {
      border-color: var(--accent-primary);
      color: var(--accent-primary);
    }
    .admin-save-btn {
      padding: 12px 24px;
      background: var(--accent-gradient);
      border: none;
      border-radius: 8px;
      color: white;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .admin-save-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 15px rgba(255, 46, 187, 0.3);
    }
    .admin-character-item {
      display: flex;
      gap: 16px;
      padding: 16px;
      background: var(--bg-tertiary);
      border-radius: 12px;
      margin-bottom: 16px;
    }
    .admin-character-fields {
      flex: 1;
    }
    .admin-bullet-item {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }
    .admin-bullet-item .admin-input {
      flex: 1;
    }
    .admin-showcase-item {
      background: var(--bg-tertiary);
      border-radius: 8px;
      padding: 12px;
    }
    .admin-showcase-image-wrapper {
      position: relative;
      cursor: pointer;
    }
    .admin-showcase-image-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 0.9rem;
      border-radius: 8px;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }
    .admin-showcase-image-wrapper:hover .admin-showcase-image-overlay {
      opacity: 1;
    }
    .admin-input-with-button {
      display: flex;
      gap: 8px;
    }
    .admin-input-with-button .admin-input {
      flex: 1;
    }
    .admin-upload-btn {
      padding: 0 14px;
      background: var(--bg-hover);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      cursor: pointer;
      font-size: 1.1rem;
      transition: all 0.2s;
    }
    .admin-upload-btn:hover {
      background: var(--accent-primary);
      border-color: var(--accent-primary);
    }
    .admin-tab--highlight {
      background: linear-gradient(135deg, #4ade80 0%, #22d3ee 100%) !important;
      border-color: transparent !important;
      color: #1a1a2e !important;
      font-weight: 600;
    }
    .admin-image-upload-zone {
      border: 2px dashed var(--border-color);
      border-radius: 12px;
      padding: 40px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      background: var(--bg-tertiary);
    }
    .admin-image-upload-zone:hover,
    .admin-image-upload-zone.dragover {
      border-color: var(--accent-primary);
      background: rgba(255, 46, 187, 0.05);
    }
    .admin-image-upload-zone--small {
      padding: 20px;
      margin-bottom: 16px;
    }
    .upload-zone-content .upload-icon {
      font-size: 3rem;
      margin-bottom: 12px;
    }
    .upload-zone-content p {
      color: var(--text-primary);
      margin: 0;
    }
    .upload-zone-content .upload-hint {
      color: var(--text-secondary);
      font-size: 0.85rem;
      margin-top: 8px;
      display: block;
    }
    .admin-image-library-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 16px;
    }
    .admin-image-library-grid--picker {
      max-height: 400px;
      overflow-y: auto;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 10px;
    }
    .admin-image-card {
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      background: var(--bg-tertiary);
      aspect-ratio: 1;
    }
    .admin-image-card img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .admin-image-card-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .admin-image-card:hover .admin-image-card-overlay {
      opacity: 1;
    }
    .admin-image-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: rgba(255,255,255,0.2);
      cursor: pointer;
      font-size: 1rem;
      transition: all 0.2s;
    }
    .admin-image-btn:hover {
      background: rgba(255,255,255,0.3);
      transform: scale(1.1);
    }
    .admin-image-btn.admin-btn-danger:hover {
      background: #ff4444;
    }
    .admin-image-card-info {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 8px;
      background: linear-gradient(transparent, rgba(0,0,0,0.8));
      font-size: 0.75rem;
    }
    .admin-image-filename {
      display: block;
      color: white;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .admin-image-context {
      color: rgba(255,255,255,0.6);
      text-transform: capitalize;
    }
    .admin-image-card--selectable {
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .admin-image-card--selectable:hover {
      transform: scale(1.05);
      box-shadow: 0 4px 20px rgba(255, 46, 187, 0.3);
    }
    .admin-modal {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      padding: 20px;
    }
    .admin-modal-content {
      background: var(--bg-card);
      border-radius: 16px;
      width: 100%;
      max-width: 600px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
    }
    .admin-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      border-bottom: 1px solid var(--border-color);
    }
    .admin-modal-header h3 {
      margin: 0;
      color: var(--text-primary);
    }
    .admin-modal-body {
      padding: 20px;
      overflow-y: auto;
    }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @media (max-width: 768px) {
      .admin-form-row {
        flex-direction: column;
        gap: 0;
      }
      .admin-list-item {
        flex-direction: column;
        align-items: stretch;
      }
      .admin-list-item-actions {
        justify-content: flex-end;
      }
      .admin-character-item {
        flex-direction: column;
      }
    }
  `;
  document.head.appendChild(style);
}

// Export functions
window.loadAdminLandingContent = loadAdminLandingContent;
window.showAdminLandingTab = showAdminLandingTab;
window.openImagePicker = openImagePicker;
window.closeImagePicker = closeImagePicker;
window.selectPickerImage = selectPickerImage;
window.openImagePickerForField = openImagePickerForField;
window.openImagePickerForShowcase = openImagePickerForShowcase;
window.copyImageUrl = copyImageUrl;
window.editImageMetadata = editImageMetadata;
window.deleteLibraryImage = deleteLibraryImage;
window.filterImageLibrary = filterImageLibrary;
// Trial testing exports
window.toggleTrialAdminBypass = toggleTrialAdminBypass;
window.testTrialGeneration = testTrialGeneration;
window.resetAllTrials = resetAllTrials;
window.viewTrialStatus = viewTrialStatus;
