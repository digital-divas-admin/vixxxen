// ===========================================
// CUSTOM CHARACTER ORDER FORM
// ===========================================
// Multi-step modal for commissioning custom AI characters
// Depends on: config.js (API_BASE_URL, authFetch)

// State
let customCharacterConfig = null;
let customCharacterOrderData = {
  character_name: '',
  face_instagram_1: '',
  face_instagram_1_notes: '',
  face_instagram_2: '',
  face_instagram_2_notes: '',
  body_instagram: '',
  body_instagram_notes: '',
  google_drive_link: '',
  uploaded_images: [],
  is_rush: false,
  revisions_purchased: 0,
  interim_character_id: null,
  acknowledgments: []
};
let customOrderCurrentStep = 1;
const CUSTOM_ORDER_TOTAL_STEPS = 5;

// ===========================================
// LOAD CONFIG
// ===========================================

async function loadCustomCharacterConfig() {
  if (customCharacterConfig) return customCharacterConfig;

  try {
    const response = await fetch(`${API_BASE_URL}/api/custom-characters/config`);
    if (!response.ok) throw new Error('Failed to load config');

    const data = await response.json();
    customCharacterConfig = data.config;
    return customCharacterConfig;
  } catch (error) {
    console.error('Error loading custom character config:', error);
    return null;
  }
}

// ===========================================
// OPEN/CLOSE MODAL
// ===========================================

async function openCustomCharacterOrderModal(interimCharacterId = null) {
  // Load config first
  const config = await loadCustomCharacterConfig();
  if (!config) {
    alert('Unable to load custom character service. Please try again later.');
    return;
  }

  if (!config.is_active) {
    alert('Custom character service is currently unavailable. Please check back later.');
    return;
  }

  // Reset order data
  customCharacterOrderData = {
    character_name: '',
    face_instagram_1: '',
    face_instagram_1_notes: '',
    face_instagram_2: '',
    face_instagram_2_notes: '',
    body_instagram: '',
    body_instagram_notes: '',
    google_drive_link: '',
    uploaded_images: [],
    is_rush: false,
    revisions_purchased: 0,
    interim_character_id: interimCharacterId,
    acknowledgments: []
  };
  customOrderCurrentStep = 1;

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'customCharacterOrderModal';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px;';

  modal.innerHTML = `
    <div id="customOrderModalContent" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 20px; padding: 0; max-width: 700px; width: 100%; max-height: 90vh; overflow: hidden; border: 1px solid rgba(157, 78, 221, 0.3); box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #9d4edd, #ff2ebb); padding: 24px 32px; position: relative;">
        <button onclick="closeCustomCharacterOrderModal()" style="position: absolute; top: 16px; right: 20px; background: rgba(0,0,0,0.2); border: none; color: #fff; font-size: 1.5rem; cursor: pointer; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">&times;</button>
        <div style="font-size: 1.4rem; font-weight: 700; color: #fff; margin-bottom: 4px;">Create Your Custom Character</div>
        <div style="color: rgba(255,255,255,0.8); font-size: 0.9rem;">Starting at $${parseFloat(config.base_price).toFixed(0)}</div>
      </div>

      <!-- Progress Bar -->
      <div style="padding: 20px 32px 0;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          ${[1, 2, 3, 4, 5].map(step => `
            <div id="customOrderStepIndicator${step}" style="display: flex; flex-direction: column; align-items: center; flex: 1;">
              <div style="width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 600; transition: all 0.3s; ${step === 1 ? 'background: linear-gradient(135deg, #9d4edd, #ff2ebb); color: #fff;' : 'background: rgba(255,255,255,0.1); color: #666;'}">${step}</div>
              <div style="font-size: 0.7rem; color: ${step === 1 ? '#9d4edd' : '#666'}; margin-top: 4px; text-align: center;">${['Name', 'Face', 'Body', 'Options', 'Review'][step - 1]}</div>
            </div>
          `).join('')}
        </div>
        <div style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
          <div id="customOrderProgressBar" style="height: 100%; width: 20%; background: linear-gradient(90deg, #9d4edd, #ff2ebb); transition: width 0.3s;"></div>
        </div>
      </div>

      <!-- Step Content -->
      <div id="customOrderStepContent" style="padding: 28px 32px; min-height: 340px; overflow-y: auto; max-height: calc(90vh - 280px);">
        ${renderCustomOrderStep(1)}
      </div>

      <!-- Navigation -->
      <div style="padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
        <button id="customOrderBackBtn" onclick="customOrderPrevStep()" style="padding: 12px 24px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); border-radius: 10px; color: #888; cursor: pointer; font-size: 0.9rem; display: none;">
          Back
        </button>
        <div id="customOrderPricePreview" style="color: #4ade80; font-size: 0.9rem; font-weight: 500;">
          Total: $${parseFloat(config.base_price).toFixed(2)}
        </div>
        <button id="customOrderNextBtn" onclick="customOrderNextStep()" style="padding: 12px 32px; background: linear-gradient(135deg, #9d4edd, #ff2ebb); border: none; border-radius: 10px; color: #fff; cursor: pointer; font-size: 0.95rem; font-weight: 600;">
          Continue
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeCustomCharacterOrderModal();
  });
}

function closeCustomCharacterOrderModal() {
  const modal = document.getElementById('customCharacterOrderModal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = '';
  }
}

// ===========================================
// STEP NAVIGATION
// ===========================================

function customOrderNextStep() {
  // Validate current step
  if (!validateCustomOrderStep(customOrderCurrentStep)) {
    return;
  }

  // Save current step data
  saveCustomOrderStepData(customOrderCurrentStep);

  if (customOrderCurrentStep < CUSTOM_ORDER_TOTAL_STEPS) {
    customOrderCurrentStep++;
    renderCurrentStep();
  } else {
    submitCustomCharacterOrder();
  }
}

function customOrderPrevStep() {
  if (customOrderCurrentStep > 1) {
    saveCustomOrderStepData(customOrderCurrentStep);
    customOrderCurrentStep--;
    renderCurrentStep();
  }
}

function renderCurrentStep() {
  // Update step content
  const contentEl = document.getElementById('customOrderStepContent');
  if (contentEl) {
    contentEl.innerHTML = renderCustomOrderStep(customOrderCurrentStep);
  }

  // Update progress bar
  const progressBar = document.getElementById('customOrderProgressBar');
  if (progressBar) {
    progressBar.style.width = `${(customOrderCurrentStep / CUSTOM_ORDER_TOTAL_STEPS) * 100}%`;
  }

  // Update step indicators
  for (let i = 1; i <= CUSTOM_ORDER_TOTAL_STEPS; i++) {
    const indicator = document.getElementById(`customOrderStepIndicator${i}`);
    if (indicator) {
      const circle = indicator.querySelector('div');
      const label = indicator.querySelectorAll('div')[1];
      if (i <= customOrderCurrentStep) {
        circle.style.background = 'linear-gradient(135deg, #9d4edd, #ff2ebb)';
        circle.style.color = '#fff';
        label.style.color = '#9d4edd';
      } else {
        circle.style.background = 'rgba(255,255,255,0.1)';
        circle.style.color = '#666';
        label.style.color = '#666';
      }
    }
  }

  // Update navigation buttons
  const backBtn = document.getElementById('customOrderBackBtn');
  const nextBtn = document.getElementById('customOrderNextBtn');

  if (backBtn) {
    backBtn.style.display = customOrderCurrentStep > 1 ? 'block' : 'none';
  }

  if (nextBtn) {
    if (customOrderCurrentStep === CUSTOM_ORDER_TOTAL_STEPS) {
      nextBtn.textContent = 'Submit Order';
      nextBtn.style.background = 'linear-gradient(135deg, #4ade80, #22c55e)';
    } else {
      nextBtn.textContent = 'Continue';
      nextBtn.style.background = 'linear-gradient(135deg, #9d4edd, #ff2ebb)';
    }
  }

  // Update price preview
  updateCustomOrderPricePreview();
}

// ===========================================
// RENDER STEPS
// ===========================================

function renderCustomOrderStep(step) {
  switch (step) {
    case 1:
      return renderStep1_CharacterName();
    case 2:
      return renderStep2_FaceInspiration();
    case 3:
      return renderStep3_BodyInspiration();
    case 4:
      return renderStep4_Options();
    case 5:
      return renderStep5_Review();
    default:
      return '';
  }
}

// Step 1: Character Name
function renderStep1_CharacterName() {
  return `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 2.5rem; margin-bottom: 12px;">👤</div>
      <h3 style="color: #fff; font-size: 1.3rem; margin: 0 0 8px;">Name Your Character</h3>
      <p style="color: #888; font-size: 0.9rem; margin: 0;">Choose a unique name for your custom AI character</p>
    </div>

    <div style="max-width: 400px; margin: 0 auto;">
      <input type="text" id="customOrderCharacterName" placeholder="Enter character name..." value="${escapeHtml(customCharacterOrderData.character_name)}" maxlength="50"
        style="width: 100%; padding: 16px 20px; background: rgba(255,255,255,0.05); border: 2px solid rgba(157, 78, 221, 0.3); border-radius: 12px; color: #fff; font-size: 1.1rem; text-align: center; outline: none; transition: border-color 0.3s;"
        onfocus="this.style.borderColor='#9d4edd'" onblur="this.style.borderColor='rgba(157, 78, 221, 0.3)'">
      <div style="text-align: center; color: #666; font-size: 0.8rem; margin-top: 8px;">
        <span id="customOrderNameCount">${customCharacterOrderData.character_name.length}</span>/50 characters
      </div>
    </div>

    <div style="background: rgba(157, 78, 221, 0.1); border: 1px solid rgba(157, 78, 221, 0.2); border-radius: 12px; padding: 16px; margin-top: 24px;">
      <div style="display: flex; align-items: start; gap: 12px;">
        <span style="font-size: 1.2rem;">💡</span>
        <div style="color: #aaa; font-size: 0.85rem; line-height: 1.5;">
          <strong style="color: #9d4edd;">Tip:</strong> Choose a name that's memorable and reflects the personality you envision for your character. This will be the name displayed throughout the platform.
        </div>
      </div>
    </div>
  `;
}

// Step 2: Face Inspiration
function renderStep2_FaceInspiration() {
  return `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 2.5rem; margin-bottom: 12px;">😊</div>
      <h3 style="color: #fff; font-size: 1.3rem; margin: 0 0 8px;">Face Inspiration</h3>
      <p style="color: #888; font-size: 0.9rem; margin: 0;">Provide 2 Instagram accounts for face reference</p>
    </div>

    <!-- Face Instagram 1 -->
    <div style="margin-bottom: 20px;">
      <label style="display: block; color: #9d4edd; font-size: 0.9rem; font-weight: 500; margin-bottom: 8px;">
        Face Reference #1 <span style="color: #ff4444;">*</span>
      </label>
      <input type="text" id="customOrderFaceIG1" placeholder="instagram.com/username or @username" value="${escapeHtml(customCharacterOrderData.face_instagram_1)}"
        style="width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 10px; color: #fff; font-size: 0.95rem; outline: none; margin-bottom: 8px;"
        onfocus="this.style.borderColor='#9d4edd'" onblur="this.style.borderColor='rgba(157, 78, 221, 0.3)'">
      <textarea id="customOrderFaceIG1Notes" placeholder="Optional notes (e.g., 'Love the eyes in her photos')" rows="2"
        style="width: 100%; padding: 12px 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #aaa; font-size: 0.85rem; outline: none; resize: none;">${escapeHtml(customCharacterOrderData.face_instagram_1_notes)}</textarea>
    </div>

    <!-- Face Instagram 2 -->
    <div style="margin-bottom: 20px;">
      <label style="display: block; color: #9d4edd; font-size: 0.9rem; font-weight: 500; margin-bottom: 8px;">
        Face Reference #2 <span style="color: #ff4444;">*</span>
      </label>
      <input type="text" id="customOrderFaceIG2" placeholder="instagram.com/username or @username" value="${escapeHtml(customCharacterOrderData.face_instagram_2)}"
        style="width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 10px; color: #fff; font-size: 0.95rem; outline: none; margin-bottom: 8px;"
        onfocus="this.style.borderColor='#9d4edd'" onblur="this.style.borderColor='rgba(157, 78, 221, 0.3)'">
      <textarea id="customOrderFaceIG2Notes" placeholder="Optional notes (e.g., 'Nose and jawline are perfect')" rows="2"
        style="width: 100%; padding: 12px 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #aaa; font-size: 0.85rem; outline: none; resize: none;">${escapeHtml(customCharacterOrderData.face_instagram_2_notes)}</textarea>
    </div>

    <div style="background: rgba(255, 165, 0, 0.1); border: 1px solid rgba(255, 165, 0, 0.2); border-radius: 12px; padding: 14px;">
      <div style="color: #ffa500; font-size: 0.85rem; line-height: 1.5;">
        <strong>Requirements:</strong> ${customCharacterConfig?.requirements_text || 'Accounts should have 50+ posts with variety of face shots and minimal tattoos.'}
      </div>
    </div>
  `;
}

// Step 3: Body Inspiration
function renderStep3_BodyInspiration() {
  return `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 2.5rem; margin-bottom: 12px;">💃</div>
      <h3 style="color: #fff; font-size: 1.3rem; margin: 0 0 8px;">Body Inspiration</h3>
      <p style="color: #888; font-size: 0.9rem; margin: 0;">Provide 1 Instagram account for body reference</p>
    </div>

    <!-- Body Instagram -->
    <div style="margin-bottom: 20px;">
      <label style="display: block; color: #ff2ebb; font-size: 0.9rem; font-weight: 500; margin-bottom: 8px;">
        Body Reference <span style="color: #ff4444;">*</span>
      </label>
      <input type="text" id="customOrderBodyIG" placeholder="instagram.com/username or @username" value="${escapeHtml(customCharacterOrderData.body_instagram)}"
        style="width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255, 46, 187, 0.3); border-radius: 10px; color: #fff; font-size: 0.95rem; outline: none; margin-bottom: 8px;"
        onfocus="this.style.borderColor='#ff2ebb'" onblur="this.style.borderColor='rgba(255, 46, 187, 0.3)'">
      <textarea id="customOrderBodyIGNotes" placeholder="Optional notes (e.g., 'Athletic build, similar proportions')" rows="2"
        style="width: 100%; padding: 12px 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #aaa; font-size: 0.85rem; outline: none; resize: none;">${escapeHtml(customCharacterOrderData.body_instagram_notes)}</textarea>
    </div>

    <!-- Additional References -->
    <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
      <label style="display: block; color: #888; font-size: 0.9rem; font-weight: 500; margin-bottom: 12px;">
        Additional References (Optional)
      </label>

      <input type="url" id="customOrderGoogleDrive" placeholder="Google Drive link to additional reference images" value="${escapeHtml(customCharacterOrderData.google_drive_link)}"
        style="width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #fff; font-size: 0.9rem; outline: none; margin-bottom: 12px;">

      <div style="color: #666; font-size: 0.8rem; text-align: center;">
        You can share a Google Drive folder with additional reference images if needed. Make sure the link is set to "Anyone with link can view".
      </div>
    </div>
  `;
}

// Step 4: Options
function renderStep4_Options() {
  const config = customCharacterConfig;
  const basePrice = parseFloat(config?.base_price || 795);
  const revisionPrice = parseFloat(config?.revision_price || 100);
  const rushFee = parseFloat(config?.rush_fee || 200);
  const maxRevisions = config?.max_revisions || 3;

  return `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 2.5rem; margin-bottom: 12px;">⚙️</div>
      <h3 style="color: #fff; font-size: 1.3rem; margin: 0 0 8px;">Customize Your Order</h3>
      <p style="color: #888; font-size: 0.9rem; margin: 0;">Add revisions and rush delivery options</p>
    </div>

    <!-- Rush Delivery -->
    <div style="background: rgba(255,68,68,0.05); border: 1px solid rgba(255,68,68,0.2); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
      <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
        <input type="checkbox" id="customOrderRush" ${customCharacterOrderData.is_rush ? 'checked' : ''} onchange="updateCustomOrderPricePreview()"
          style="width: 22px; height: 22px; accent-color: #ff4444;">
        <div style="flex: 1;">
          <div style="color: #fff; font-weight: 500; font-size: 0.95rem;">Rush Delivery</div>
          <div style="color: #888; font-size: 0.8rem;">Get your character in ${config?.rush_days || 2} days instead of ${config?.standard_days_min || 3}-${config?.standard_days_max || 5} days</div>
        </div>
        <div style="color: #ff4444; font-weight: 600; font-size: 1rem;">+$${rushFee.toFixed(0)}</div>
      </label>
    </div>

    <!-- Revisions -->
    <div style="background: rgba(157, 78, 221, 0.05); border: 1px solid rgba(157, 78, 221, 0.2); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div>
          <div style="color: #fff; font-weight: 500; font-size: 0.95rem;">Revision Packages</div>
          <div style="color: #888; font-size: 0.8rem;">Request changes after initial delivery</div>
        </div>
        <div style="color: #9d4edd; font-weight: 600; font-size: 0.9rem;">$${revisionPrice.toFixed(0)} each</div>
      </div>

      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        ${[0, 1, 2, 3].filter(n => n <= maxRevisions).map(num => `
          <button onclick="selectRevisionPackage(${num})" id="revisionBtn${num}"
            style="flex: 1; min-width: 70px; padding: 12px 16px; background: ${customCharacterOrderData.revisions_purchased === num ? 'linear-gradient(135deg, #9d4edd, #ff2ebb)' : 'rgba(255,255,255,0.05)'}; border: 1px solid ${customCharacterOrderData.revisions_purchased === num ? 'transparent' : 'rgba(157, 78, 221, 0.3)'}; border-radius: 10px; color: #fff; cursor: pointer; font-size: 0.9rem; transition: all 0.2s;">
            <div style="font-weight: 600;">${num}</div>
            <div style="font-size: 0.75rem; opacity: 0.8;">${num === 0 ? 'None' : `+$${(num * revisionPrice).toFixed(0)}`}</div>
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Interim Character Info -->
    ${customCharacterOrderData.interim_character_id ? `
      <div style="background: rgba(74, 222, 128, 0.05); border: 1px solid rgba(74, 222, 128, 0.2); border-radius: 12px; padding: 16px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 1.2rem;">✓</span>
          <div style="color: #4ade80; font-size: 0.9rem;">
            <strong>Interim Character Selected</strong><br>
            <span style="color: #888; font-size: 0.8rem;">You'll have immediate access to this character while your custom one is being created.</span>
          </div>
        </div>
      </div>
    ` : `
      <div style="background: rgba(255, 165, 0, 0.05); border: 1px solid rgba(255, 165, 0, 0.2); border-radius: 12px; padding: 16px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 1.2rem;">💡</span>
          <div style="color: #ffa500; font-size: 0.85rem;">
            Consider selecting a character from our catalog to use while your custom character is being created.
          </div>
        </div>
      </div>
    `}
  `;
}

// Step 5: Review & Acknowledgments
function renderStep5_Review() {
  const config = customCharacterConfig;
  const basePrice = parseFloat(config?.base_price || 795);
  const revisionPrice = parseFloat(config?.revision_price || 100);
  const rushFee = customCharacterOrderData.is_rush ? parseFloat(config?.rush_fee || 200) : 0;
  const revisionsTotal = customCharacterOrderData.revisions_purchased * revisionPrice;
  const totalPrice = basePrice + revisionsTotal + rushFee;

  const deliveryDays = customCharacterOrderData.is_rush ? (config?.rush_days || 2) : `${config?.standard_days_min || 3}-${config?.standard_days_max || 5}`;

  const disclaimers = config?.disclaimers || [
    "I understand the final result is based on AI and may not exactly match my inspiration references",
    "I understand individual features (eyes, nose, etc.) cannot be altered without using a full revision",
    "I understand the character creation process takes 3-5 business days (or 2 days for rush orders)",
    "I confirm all Instagram accounts I provided meet the requirements (50+ posts, variety of shots, minimal tattoos)"
  ];

  return `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="font-size: 2.5rem; margin-bottom: 12px;">📋</div>
      <h3 style="color: #fff; font-size: 1.3rem; margin: 0 0 8px;">Review Your Order</h3>
      <p style="color: #888; font-size: 0.9rem; margin: 0;">Please review and acknowledge the terms</p>
    </div>

    <!-- Order Summary -->
    <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
      <div style="display: grid; gap: 10px; font-size: 0.9rem;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #888;">Character Name</span>
          <span style="color: #fff; font-weight: 500;">${escapeHtml(customCharacterOrderData.character_name)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #888;">Face References</span>
          <span style="color: #9d4edd;">2 Instagram accounts</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #888;">Body Reference</span>
          <span style="color: #ff2ebb;">1 Instagram account</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #888;">Estimated Delivery</span>
          <span style="color: #fff;">${deliveryDays} business days</span>
        </div>
        <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; margin-top: 4px;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #888;">Base Price</span>
            <span style="color: #fff;">$${basePrice.toFixed(2)}</span>
          </div>
          ${customCharacterOrderData.revisions_purchased > 0 ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #888;">Revisions (${customCharacterOrderData.revisions_purchased})</span>
              <span style="color: #fff;">$${revisionsTotal.toFixed(2)}</span>
            </div>
          ` : ''}
          ${rushFee > 0 ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #888;">Rush Delivery</span>
              <span style="color: #ff4444;">$${rushFee.toFixed(2)}</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">
            <span style="color: #fff; font-weight: 600;">Total</span>
            <span style="color: #4ade80; font-weight: 700; font-size: 1.1rem;">$${totalPrice.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Acknowledgments -->
    <div style="background: rgba(255, 165, 0, 0.05); border: 1px solid rgba(255, 165, 0, 0.2); border-radius: 12px; padding: 16px;">
      <div style="color: #ffa500; font-weight: 500; font-size: 0.9rem; margin-bottom: 12px;">Please acknowledge the following:</div>
      ${disclaimers.map((disclaimer, index) => `
        <label style="display: flex; align-items: start; gap: 10px; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" class="customOrderAcknowledgment" data-index="${index}" ${customCharacterOrderData.acknowledgments.includes(index) ? 'checked' : ''}
            style="width: 18px; height: 18px; accent-color: #ffa500; margin-top: 2px; flex-shrink: 0;">
          <span style="color: #aaa; font-size: 0.85rem; line-height: 1.4;">${disclaimer}</span>
        </label>
      `).join('')}
    </div>
  `;
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function selectRevisionPackage(num) {
  customCharacterOrderData.revisions_purchased = num;

  // Update button styles
  for (let i = 0; i <= 3; i++) {
    const btn = document.getElementById(`revisionBtn${i}`);
    if (btn) {
      if (i === num) {
        btn.style.background = 'linear-gradient(135deg, #9d4edd, #ff2ebb)';
        btn.style.border = '1px solid transparent';
      } else {
        btn.style.background = 'rgba(255,255,255,0.05)';
        btn.style.border = '1px solid rgba(157, 78, 221, 0.3)';
      }
    }
  }

  updateCustomOrderPricePreview();
}

function updateCustomOrderPricePreview() {
  const config = customCharacterConfig;
  const basePrice = parseFloat(config?.base_price || 795);
  const revisionPrice = parseFloat(config?.revision_price || 100);

  // Check rush checkbox if on step 4
  const rushCheckbox = document.getElementById('customOrderRush');
  if (rushCheckbox) {
    customCharacterOrderData.is_rush = rushCheckbox.checked;
  }

  const rushFee = customCharacterOrderData.is_rush ? parseFloat(config?.rush_fee || 200) : 0;
  const revisionsTotal = customCharacterOrderData.revisions_purchased * revisionPrice;
  const totalPrice = basePrice + revisionsTotal + rushFee;

  const priceEl = document.getElementById('customOrderPricePreview');
  if (priceEl) {
    priceEl.innerHTML = `Total: <strong>$${totalPrice.toFixed(2)}</strong>`;
  }
}

function saveCustomOrderStepData(step) {
  switch (step) {
    case 1:
      const nameInput = document.getElementById('customOrderCharacterName');
      if (nameInput) customCharacterOrderData.character_name = nameInput.value.trim();
      break;

    case 2:
      const face1 = document.getElementById('customOrderFaceIG1');
      const face1Notes = document.getElementById('customOrderFaceIG1Notes');
      const face2 = document.getElementById('customOrderFaceIG2');
      const face2Notes = document.getElementById('customOrderFaceIG2Notes');
      if (face1) customCharacterOrderData.face_instagram_1 = face1.value.trim();
      if (face1Notes) customCharacterOrderData.face_instagram_1_notes = face1Notes.value.trim();
      if (face2) customCharacterOrderData.face_instagram_2 = face2.value.trim();
      if (face2Notes) customCharacterOrderData.face_instagram_2_notes = face2Notes.value.trim();
      break;

    case 3:
      const body = document.getElementById('customOrderBodyIG');
      const bodyNotes = document.getElementById('customOrderBodyIGNotes');
      const gdrive = document.getElementById('customOrderGoogleDrive');
      if (body) customCharacterOrderData.body_instagram = body.value.trim();
      if (bodyNotes) customCharacterOrderData.body_instagram_notes = bodyNotes.value.trim();
      if (gdrive) customCharacterOrderData.google_drive_link = gdrive.value.trim();
      break;

    case 4:
      const rush = document.getElementById('customOrderRush');
      if (rush) customCharacterOrderData.is_rush = rush.checked;
      break;

    case 5:
      const checkboxes = document.querySelectorAll('.customOrderAcknowledgment');
      customCharacterOrderData.acknowledgments = [];
      checkboxes.forEach((cb, i) => {
        if (cb.checked) customCharacterOrderData.acknowledgments.push(i);
      });
      break;
  }
}

function validateCustomOrderStep(step) {
  switch (step) {
    case 1:
      const name = document.getElementById('customOrderCharacterName')?.value.trim();
      if (!name || name.length < 2) {
        showCustomOrderError('Please enter a character name (at least 2 characters)');
        return false;
      }
      if (name.length > 50) {
        showCustomOrderError('Character name must be 50 characters or less');
        return false;
      }
      return true;

    case 2:
      const face1 = document.getElementById('customOrderFaceIG1')?.value.trim();
      const face2 = document.getElementById('customOrderFaceIG2')?.value.trim();
      if (!face1) {
        showCustomOrderError('Please provide Face Reference #1');
        return false;
      }
      if (!face2) {
        showCustomOrderError('Please provide Face Reference #2');
        return false;
      }
      return true;

    case 3:
      const body = document.getElementById('customOrderBodyIG')?.value.trim();
      if (!body) {
        showCustomOrderError('Please provide a Body Reference');
        return false;
      }
      return true;

    case 4:
      // Options are all optional
      return true;

    case 5:
      const checkboxes = document.querySelectorAll('.customOrderAcknowledgment');
      const disclaimersCount = customCharacterConfig?.disclaimers?.length || 4;
      let checkedCount = 0;
      checkboxes.forEach(cb => { if (cb.checked) checkedCount++; });
      if (checkedCount < disclaimersCount) {
        showCustomOrderError('Please acknowledge all terms before submitting');
        return false;
      }
      return true;
  }
  return true;
}

function showCustomOrderError(message) {
  // Remove existing error
  const existing = document.querySelector('.custom-order-error');
  if (existing) existing.remove();

  const errorEl = document.createElement('div');
  errorEl.className = 'custom-order-error';
  errorEl.style.cssText = 'background: rgba(255,68,68,0.1); border: 1px solid rgba(255,68,68,0.3); color: #ff4444; padding: 12px 16px; border-radius: 10px; margin-bottom: 16px; font-size: 0.9rem; text-align: center;';
  errorEl.textContent = message;

  const content = document.getElementById('customOrderStepContent');
  if (content) content.prepend(errorEl);

  // Auto remove after 5 seconds
  setTimeout(() => errorEl.remove(), 5000);
}

// ===========================================
// SUBMIT ORDER
// ===========================================

async function submitCustomCharacterOrder() {
  // Final validation
  saveCustomOrderStepData(5);

  const checkboxes = document.querySelectorAll('.customOrderAcknowledgment');
  const disclaimersCount = customCharacterConfig?.disclaimers?.length || 4;
  let checkedCount = 0;
  checkboxes.forEach(cb => { if (cb.checked) checkedCount++; });
  if (checkedCount < disclaimersCount) {
    showCustomOrderError('Please acknowledge all terms before submitting');
    return;
  }

  // Disable submit button
  const submitBtn = document.getElementById('customOrderNextBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    submitBtn.style.opacity = '0.7';
  }

  try {
    const response = await authFetch(`${API_BASE_URL}/api/custom-characters/orders`, {
      method: 'POST',
      body: JSON.stringify(customCharacterOrderData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to submit order');
    }

    const data = await response.json();

    // Show success
    showCustomOrderSuccess(data.order);

  } catch (error) {
    console.error('Error submitting custom character order:', error);
    showCustomOrderError(error.message || 'Failed to submit order. Please try again.');

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Order';
      submitBtn.style.opacity = '1';
    }
  }
}

function showCustomOrderSuccess(order) {
  const content = document.getElementById('customOrderModalContent');
  if (!content) return;

  const config = customCharacterConfig;
  const deliveryDays = order.is_rush ? (config?.rush_days || 2) : `${config?.standard_days_min || 3}-${config?.standard_days_max || 5}`;

  content.innerHTML = `
    <div style="padding: 60px 32px; text-align: center;">
      <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #4ade80, #22c55e); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
        <svg width="40" height="40" fill="#fff" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
      </div>

      <h2 style="color: #fff; font-size: 1.5rem; margin: 0 0 12px;">Order Submitted!</h2>
      <p style="color: #888; font-size: 0.95rem; margin: 0 0 32px;">Your custom character order has been received.</p>

      <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 20px; text-align: left; margin-bottom: 24px;">
        <div style="display: grid; gap: 12px; font-size: 0.9rem;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #888;">Order Number</span>
            <span style="color: #9d4edd; font-weight: 600;">#${order.order_number}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #888;">Character Name</span>
            <span style="color: #fff;">${escapeHtml(order.character_name)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #888;">Estimated Delivery</span>
            <span style="color: #fff;">${deliveryDays} business days</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #888;">Total</span>
            <span style="color: #4ade80; font-weight: 600;">$${parseFloat(order.total_price).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div style="background: rgba(157, 78, 221, 0.1); border: 1px solid rgba(157, 78, 221, 0.2); border-radius: 12px; padding: 16px; margin-bottom: 24px;">
        <div style="color: #aaa; font-size: 0.85rem; line-height: 1.5;">
          ${order.interim_character_id ?
            "You'll receive an email when your custom character is ready. In the meantime, you can start using your interim character!" :
            "You'll receive an email when your custom character is ready to use."
          }
        </div>
      </div>

      <button onclick="closeCustomCharacterOrderModal()" style="padding: 14px 40px; background: linear-gradient(135deg, #9d4edd, #ff2ebb); border: none; border-radius: 12px; color: #fff; cursor: pointer; font-size: 1rem; font-weight: 600;">
        Got It!
      </button>
    </div>
  `;
}

// Helper function (ensure it exists)
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
