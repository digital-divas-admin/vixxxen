// ===========================================
// CUSTOM CHARACTER ORDER FORM
// ===========================================
// Multi-step modal for commissioning custom AI characters
// Depends on: config.js (API_BASE_URL, authFetch)

// State
let customCharacterConfig = null;
// Stores the submitted order so the wizard review can access it
let submittedCustomCharacterOrder = null;
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
  acknowledgments: [],
  // New: flag for providing own references instead of Instagram
  providing_own_references: false
};
let customOrderCurrentStep = 1;
const CUSTOM_ORDER_TOTAL_STEPS = 5;

// Instagram URL validation helper
function isValidInstagramUrl(url) {
  if (!url) return false;
  // Must be a proper Instagram URL
  const pattern = /^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9_.]+\/?$/i;
  return pattern.test(url.trim());
}

function formatInstagramInput(input) {
  let value = input.value.trim();
  // If they just typed a username without URL, don't auto-format - let validation catch it
  return value;
}

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
    acknowledgments: [],
    providing_own_references: false
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
  const providingOwn = customCharacterOrderData.providing_own_references;

  return `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="font-size: 2.5rem; margin-bottom: 12px;">😊</div>
      <h3 style="color: #fff; font-size: 1.3rem; margin: 0 0 8px;">Face Inspiration</h3>
      <p style="color: #888; font-size: 0.9rem; margin: 0;">Provide 2 Instagram profile URLs for face reference</p>
    </div>

    <!-- Option to provide own references -->
    <div style="background: rgba(157, 78, 221, 0.1); border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 12px; padding: 14px; margin-bottom: 20px;">
      <label style="display: flex; align-items: start; gap: 12px; cursor: pointer;">
        <input type="checkbox" id="customOrderProvidingOwn" ${providingOwn ? 'checked' : ''} onchange="toggleProvidingOwnReferences()"
          style="width: 20px; height: 20px; accent-color: #9d4edd; margin-top: 2px; flex-shrink: 0;">
        <div>
          <div style="color: #fff; font-weight: 500; font-size: 0.9rem;">I'll provide my own reference images or Google Drive link instead</div>
          <div style="color: #888; font-size: 0.8rem; margin-top: 4px;">Check this if you're uploading images or sharing a Google Drive folder with reference photos.</div>
        </div>
      </label>
    </div>

    <!-- Instagram inputs (shown unless providing own) -->
    <div id="faceInstagramInputs" style="${providingOwn ? 'opacity: 0.4; pointer-events: none;' : ''}">
      <!-- Face Instagram 1 -->
      <div style="margin-bottom: 16px;">
        <label style="display: block; color: #9d4edd; font-size: 0.9rem; font-weight: 500; margin-bottom: 8px;">
          Face Reference #1 ${!providingOwn ? '<span style="color: #ff4444;">*</span>' : ''}
        </label>
        <input type="url" id="customOrderFaceIG1" placeholder="https://instagram.com/username" value="${escapeHtml(customCharacterOrderData.face_instagram_1)}"
          style="width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 10px; color: #fff; font-size: 0.95rem; outline: none; margin-bottom: 8px;"
          onfocus="this.style.borderColor='#9d4edd'" onblur="this.style.borderColor='rgba(157, 78, 221, 0.3)'">
        <textarea id="customOrderFaceIG1Notes" placeholder="Optional notes (e.g., 'Love the eyes in her photos')" rows="2"
          style="width: 100%; padding: 12px 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #aaa; font-size: 0.85rem; outline: none; resize: none;">${escapeHtml(customCharacterOrderData.face_instagram_1_notes)}</textarea>
      </div>

      <!-- Face Instagram 2 -->
      <div style="margin-bottom: 16px;">
        <label style="display: block; color: #9d4edd; font-size: 0.9rem; font-weight: 500; margin-bottom: 8px;">
          Face Reference #2 ${!providingOwn ? '<span style="color: #ff4444;">*</span>' : ''}
        </label>
        <input type="url" id="customOrderFaceIG2" placeholder="https://instagram.com/username" value="${escapeHtml(customCharacterOrderData.face_instagram_2)}"
          style="width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 10px; color: #fff; font-size: 0.95rem; outline: none; margin-bottom: 8px;"
          onfocus="this.style.borderColor='#9d4edd'" onblur="this.style.borderColor='rgba(157, 78, 221, 0.3)'">
        <textarea id="customOrderFaceIG2Notes" placeholder="Optional notes (e.g., 'Nose and jawline are perfect')" rows="2"
          style="width: 100%; padding: 12px 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #aaa; font-size: 0.85rem; outline: none; resize: none;">${escapeHtml(customCharacterOrderData.face_instagram_2_notes)}</textarea>
      </div>
    </div>

    <div style="background: rgba(255, 165, 0, 0.1); border: 1px solid rgba(255, 165, 0, 0.2); border-radius: 12px; padding: 14px;">
      <div style="color: #ffa500; font-size: 0.85rem; line-height: 1.5;">
        <strong>URL Format:</strong> Enter full Instagram URLs like <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">https://instagram.com/username</code><br>
        <strong>Requirements:</strong> ${customCharacterConfig?.requirements_text || 'Accounts should have 50+ posts with variety of face shots and minimal tattoos.'}
      </div>
    </div>
  `;
}

// Toggle providing own references
function toggleProvidingOwnReferences() {
  const checkbox = document.getElementById('customOrderProvidingOwn');
  customCharacterOrderData.providing_own_references = checkbox?.checked || false;
  renderCurrentStep();
}

// Step 3: Body Inspiration
function renderStep3_BodyInspiration() {
  const providingOwn = customCharacterOrderData.providing_own_references;

  return `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="font-size: 2.5rem; margin-bottom: 12px;">💃</div>
      <h3 style="color: #fff; font-size: 1.3rem; margin: 0 0 8px;">${providingOwn ? 'Your Reference Images' : 'Body Inspiration'}</h3>
      <p style="color: #888; font-size: 0.9rem; margin: 0;">${providingOwn ? 'Provide your reference images via Google Drive' : 'Provide 1 Instagram profile URL for body reference'}</p>
    </div>

    ${providingOwn ? `
      <!-- Google Drive Required when providing own -->
      <div style="background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.3); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <span style="font-size: 1.2rem;">📁</span>
          <div style="color: #4ade80; font-weight: 500;">Google Drive Link Required</div>
        </div>
        <p style="color: #aaa; font-size: 0.85rem; margin: 0 0 16px;">Since you're providing your own reference images, please share a Google Drive folder containing your photos.</p>

        <input type="url" id="customOrderGoogleDrive" placeholder="https://drive.google.com/..." value="${escapeHtml(customCharacterOrderData.google_drive_link)}"
          style="width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(74, 222, 128, 0.3); border-radius: 10px; color: #fff; font-size: 0.95rem; outline: none;"
          onfocus="this.style.borderColor='#4ade80'" onblur="this.style.borderColor='rgba(74, 222, 128, 0.3)'">

        <div style="color: #888; font-size: 0.8rem; margin-top: 10px;">
          Make sure the link is set to <strong>"Anyone with link can view"</strong>
        </div>
      </div>

      <div style="background: rgba(255, 165, 0, 0.1); border: 1px solid rgba(255, 165, 0, 0.2); border-radius: 12px; padding: 14px;">
        <div style="color: #ffa500; font-size: 0.85rem; line-height: 1.5;">
          <strong>Required images:</strong> Include a variety of face shots (front, side angles) and body shots. The more reference images you provide, the better we can match your vision.
        </div>
      </div>
    ` : `
      <!-- Body Instagram -->
      <div style="margin-bottom: 20px;">
        <label style="display: block; color: #ff2ebb; font-size: 0.9rem; font-weight: 500; margin-bottom: 8px;">
          Body Reference <span style="color: #ff4444;">*</span>
        </label>
        <input type="url" id="customOrderBodyIG" placeholder="https://instagram.com/username" value="${escapeHtml(customCharacterOrderData.body_instagram)}"
          style="width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255, 46, 187, 0.3); border-radius: 10px; color: #fff; font-size: 0.95rem; outline: none; margin-bottom: 8px;"
          onfocus="this.style.borderColor='#ff2ebb'" onblur="this.style.borderColor='rgba(255, 46, 187, 0.3)'">
        <textarea id="customOrderBodyIGNotes" placeholder="Optional notes (e.g., 'Athletic build, similar proportions')" rows="2"
          style="width: 100%; padding: 12px 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #aaa; font-size: 0.85rem; outline: none; resize: none;">${escapeHtml(customCharacterOrderData.body_instagram_notes)}</textarea>
      </div>

      <!-- Additional References (Optional) -->
      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
        <label style="display: block; color: #888; font-size: 0.9rem; font-weight: 500; margin-bottom: 12px;">
          Additional References (Optional)
        </label>

        <input type="url" id="customOrderGoogleDrive" placeholder="https://drive.google.com/... (optional)" value="${escapeHtml(customCharacterOrderData.google_drive_link)}"
          style="width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #fff; font-size: 0.9rem; outline: none; margin-bottom: 10px;">

        <div style="color: #666; font-size: 0.8rem; text-align: center;">
          Optionally share additional reference images via Google Drive.
        </div>
      </div>

      <div style="background: rgba(255, 165, 0, 0.1); border: 1px solid rgba(255, 165, 0, 0.2); border-radius: 12px; padding: 14px; margin-top: 16px;">
        <div style="color: #ffa500; font-size: 0.85rem; line-height: 1.5;">
          <strong>URL Format:</strong> Enter full Instagram URL like <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">https://instagram.com/username</code>
        </div>
      </div>
    `}
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

      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
        ${[0, 1, 2, 3].filter(n => n <= maxRevisions).map(num => `
          <button onclick="selectRevisionPackage(${num})" id="revisionBtn${num}"
            style="flex: 1; min-width: 70px; padding: 12px 16px; background: ${customCharacterOrderData.revisions_purchased === num ? 'linear-gradient(135deg, #9d4edd, #ff2ebb)' : 'rgba(255,255,255,0.05)'}; border: 1px solid ${customCharacterOrderData.revisions_purchased === num ? 'transparent' : 'rgba(157, 78, 221, 0.3)'}; border-radius: 10px; color: #fff; cursor: pointer; font-size: 0.9rem; transition: all 0.2s;">
            <div style="font-weight: 600;">${num}</div>
            <div style="font-size: 0.75rem; opacity: 0.8;">${num === 0 ? 'None' : `+$${(num * revisionPrice).toFixed(0)}`}</div>
          </button>
        `).join('')}
      </div>

      <!-- Revision timeline warning -->
      <div style="background: rgba(255, 165, 0, 0.1); border-radius: 8px; padding: 10px 12px;">
        <div style="color: #ffa500; font-size: 0.8rem; line-height: 1.4;">
          <strong>⏱️ Timeline Note:</strong> Each revision adds approximately 3 business days to your delivery. For example, if your character is delivered in 4 days and you request a revision, expect the revision in ~3 additional days.
        </div>
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
  const providingOwn = customCharacterOrderData.providing_own_references;

  // Build disclaimers based on whether they're providing own references
  const disclaimers = [
    "I understand the final result is based on AI and may not exactly match my inspiration references",
    "I understand individual features (eyes, nose, etc.) cannot be altered without using a full revision",
    "I understand each revision request adds approximately 3 business days to the delivery timeline",
    "I understand the initial character creation takes " + deliveryDays + " business days",
    providingOwn
      ? "I confirm my Google Drive contains sufficient reference images (face and body shots from multiple angles)"
      : "I confirm all Instagram accounts I provided meet the requirements (50+ posts, variety of shots, minimal tattoos)"
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
          <span style="color: #888;">Reference Source</span>
          <span style="color: ${providingOwn ? '#4ade80' : '#9d4edd'};">${providingOwn ? 'Google Drive (own images)' : '3 Instagram accounts'}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #888;">Estimated Delivery</span>
          <span style="color: #fff;">${deliveryDays} business days</span>
        </div>
        ${customCharacterOrderData.revisions_purchased > 0 ? `
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #888;">Revisions Included</span>
            <span style="color: #9d4edd;">${customCharacterOrderData.revisions_purchased} revision${customCharacterOrderData.revisions_purchased > 1 ? 's' : ''} (+3 days each if used)</span>
          </div>
        ` : ''}
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
      // Save the providing own references checkbox
      const providingOwnCheckbox = document.getElementById('customOrderProvidingOwn');
      if (providingOwnCheckbox) customCharacterOrderData.providing_own_references = providingOwnCheckbox.checked;

      // Only save Instagram values if not providing own
      if (!customCharacterOrderData.providing_own_references) {
        const face1 = document.getElementById('customOrderFaceIG1');
        const face1Notes = document.getElementById('customOrderFaceIG1Notes');
        const face2 = document.getElementById('customOrderFaceIG2');
        const face2Notes = document.getElementById('customOrderFaceIG2Notes');
        if (face1) customCharacterOrderData.face_instagram_1 = face1.value.trim();
        if (face1Notes) customCharacterOrderData.face_instagram_1_notes = face1Notes.value.trim();
        if (face2) customCharacterOrderData.face_instagram_2 = face2.value.trim();
        if (face2Notes) customCharacterOrderData.face_instagram_2_notes = face2Notes.value.trim();
      }
      break;

    case 3:
      const gdrive = document.getElementById('customOrderGoogleDrive');
      if (gdrive) customCharacterOrderData.google_drive_link = gdrive.value.trim();

      // Only save body Instagram if not providing own references
      if (!customCharacterOrderData.providing_own_references) {
        const body = document.getElementById('customOrderBodyIG');
        const bodyNotes = document.getElementById('customOrderBodyIGNotes');
        if (body) customCharacterOrderData.body_instagram = body.value.trim();
        if (bodyNotes) customCharacterOrderData.body_instagram_notes = bodyNotes.value.trim();
      }
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
  const providingOwn = customCharacterOrderData.providing_own_references;

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
      // If providing own references, no Instagram validation needed
      if (providingOwn) {
        return true;
      }

      const face1 = document.getElementById('customOrderFaceIG1')?.value.trim();
      const face2 = document.getElementById('customOrderFaceIG2')?.value.trim();

      if (!face1) {
        showCustomOrderError('Please provide Face Reference #1 Instagram URL');
        return false;
      }
      if (!isValidInstagramUrl(face1)) {
        showCustomOrderError('Face Reference #1 must be a valid Instagram URL (e.g., https://instagram.com/username)');
        return false;
      }

      if (!face2) {
        showCustomOrderError('Please provide Face Reference #2 Instagram URL');
        return false;
      }
      if (!isValidInstagramUrl(face2)) {
        showCustomOrderError('Face Reference #2 must be a valid Instagram URL (e.g., https://instagram.com/username)');
        return false;
      }
      return true;

    case 3:
      // If providing own references, require Google Drive
      if (providingOwn) {
        const gdrive = document.getElementById('customOrderGoogleDrive')?.value.trim();
        if (!gdrive) {
          showCustomOrderError('Please provide a Google Drive link with your reference images');
          return false;
        }
        if (!gdrive.includes('drive.google.com')) {
          showCustomOrderError('Please provide a valid Google Drive link');
          return false;
        }
        return true;
      }

      // Otherwise require Instagram body reference
      const body = document.getElementById('customOrderBodyIG')?.value.trim();
      if (!body) {
        showCustomOrderError('Please provide a Body Reference Instagram URL');
        return false;
      }
      if (!isValidInstagramUrl(body)) {
        showCustomOrderError('Body Reference must be a valid Instagram URL (e.g., https://instagram.com/username)');
        return false;
      }
      return true;

    case 4:
      // Options are all optional
      return true;

    case 5:
      const checkboxes = document.querySelectorAll('.customOrderAcknowledgment');
      const disclaimersCount = 5; // We have 5 custom disclaimers
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

    // Store the order for wizard review step access (persists to localStorage)
    saveSubmittedCustomCharacterOrder({
      ...data.order,
      config: customCharacterConfig  // Include config for pricing info
    });

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

  // Load starter characters for selection
  loadStarterCharactersForSelection().then(starters => {
    const starterHTML = starters.length > 0 ? starters.map(char => `
      <div class="interim-character-option" data-id="${char.id}" onclick="selectInterimCharacter('${char.id}')" style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(255,255,255,0.03); border: 2px solid rgba(255,255,255,0.1); border-radius: 12px; cursor: pointer; transition: all 0.2s;">
        <div style="width: 60px; height: 60px; border-radius: 10px; overflow: hidden; flex-shrink: 0; background: linear-gradient(135deg, #9d4edd, #ff2ebb);">
          ${char.image_url ? `<img src="${char.image_url}" alt="${char.name}" style="width: 100%; height: 100%; object-fit: cover;">` : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">✨</div>`}
        </div>
        <div style="flex: 1;">
          <div style="color: #fff; font-weight: 500; font-size: 0.95rem;">${escapeHtml(char.name)}</div>
          <div style="color: #888; font-size: 0.8rem;">${char.category || 'Starter Character'}</div>
        </div>
        <div class="interim-check" style="width: 24px; height: 24px; border: 2px solid rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.2s;"></div>
      </div>
    `).join('') : '<div style="color: #888; text-align: center; padding: 20px;">No starter characters available</div>';

    content.innerHTML = `
      <div style="padding: 40px 32px; text-align: center;">
        <div style="width: 70px; height: 70px; background: linear-gradient(135deg, #4ade80, #22c55e); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
          <svg width="35" height="35" fill="#fff" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
        </div>

        <h2 style="color: #fff; font-size: 1.4rem; margin: 0 0 8px;">Order Submitted!</h2>
        <p style="color: #888; font-size: 0.9rem; margin: 0 0 20px;">Order #${order.order_number} • ${escapeHtml(order.character_name)} • ${deliveryDays} business days</p>

        <!-- Starter Character Selection -->
        <div style="background: linear-gradient(135deg, rgba(157, 78, 221, 0.1), rgba(255, 46, 187, 0.1)); border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 16px; padding: 24px; margin-bottom: 20px; text-align: left;">
          <div style="text-align: center; margin-bottom: 16px;">
            <div style="font-size: 1.5rem; margin-bottom: 8px;">🎭</div>
            <h3 style="color: #fff; font-size: 1.1rem; margin: 0 0 6px;">Pick a Free Character to Use While You Wait</h3>
            <p style="color: #aaa; font-size: 0.85rem; margin: 0;">Select a starter character to begin creating content immediately!</p>
          </div>

          <div id="interimCharacterList" style="display: flex; flex-direction: column; gap: 10px; max-height: 240px; overflow-y: auto; padding-right: 8px;">
            ${starterHTML}
          </div>
        </div>

        <div id="selectedInterimInfo" style="display: none; background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.3); border-radius: 10px; padding: 12px; margin-bottom: 16px;">
          <span style="color: #4ade80; font-size: 0.9rem;">✓ <span id="selectedInterimName"></span> selected as your starter character</span>
        </div>

        <button id="continueWithInterimBtn" onclick="continueWithInterimCharacter()" style="width: 100%; padding: 16px; background: linear-gradient(135deg, #9d4edd, #ff2ebb); border: none; border-radius: 12px; color: #fff; cursor: pointer; font-size: 1rem; font-weight: 600; opacity: 0.5; pointer-events: none;" disabled>
          Select a Character to Continue
        </button>

        <button onclick="skipInterimCharacter()" style="width: 100%; padding: 12px; background: transparent; border: none; color: #666; cursor: pointer; font-size: 0.85rem; margin-top: 8px;">
          Skip for now
        </button>
      </div>
    `;
  });
}

// State for selected interim character
let selectedInterimForCustomOrder = null;

// Placeholder starter characters (used when none in database)
const placeholderStartersForCustomOrder = [
  { id: 'placeholder-1', name: 'Luna', category: 'Fantasy', is_starter: true },
  { id: 'placeholder-2', name: 'Aria', category: 'Modern', is_starter: true },
  { id: 'placeholder-3', name: 'Nova', category: 'Sci-Fi', is_starter: true }
];

// Load starter characters from API (with fallback to placeholders)
async function loadStarterCharactersForSelection() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/onboarding/starter-characters`);
    if (!response.ok) throw new Error('Failed to load characters');
    const data = await response.json();
    const characters = data.characters || [];
    // If no characters from API, use placeholders
    return characters.length > 0 ? characters : placeholderStartersForCustomOrder;
  } catch (error) {
    console.error('Error loading starter characters:', error);
    // Return placeholders on error
    return placeholderStartersForCustomOrder;
  }
}

// Select interim character
function selectInterimCharacter(characterId) {
  selectedInterimForCustomOrder = characterId;

  // Update visual selection
  document.querySelectorAll('.interim-character-option').forEach(opt => {
    const isSelected = opt.dataset.id === characterId;
    opt.style.borderColor = isSelected ? '#9d4edd' : 'rgba(255,255,255,0.1)';
    opt.style.background = isSelected ? 'rgba(157, 78, 221, 0.15)' : 'rgba(255,255,255,0.03)';
    const check = opt.querySelector('.interim-check');
    if (check) {
      check.style.borderColor = isSelected ? '#4ade80' : 'rgba(255,255,255,0.2)';
      check.style.background = isSelected ? '#4ade80' : 'transparent';
      check.innerHTML = isSelected ? '<svg width="14" height="14" fill="#fff" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>' : '';
    }
  });

  // Get character name
  const selectedOpt = document.querySelector(`.interim-character-option[data-id="${characterId}"]`);
  const charName = selectedOpt?.querySelector('div > div:first-child')?.textContent || 'Character';

  // Show selected info
  const infoEl = document.getElementById('selectedInterimInfo');
  const nameEl = document.getElementById('selectedInterimName');
  if (infoEl && nameEl) {
    nameEl.textContent = charName;
    infoEl.style.display = 'block';
  }

  // Enable continue button
  const btn = document.getElementById('continueWithInterimBtn');
  if (btn) {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    btn.textContent = `Continue with ${charName}`;
  }
}

// Continue with selected interim character
function continueWithInterimCharacter() {
  if (!selectedInterimForCustomOrder) return;

  // Close the custom order modal
  closeCustomCharacterOrderModal();

  // If in onboarding wizard, set the starter character and continue
  if (typeof selectStarterCharacter === 'function') {
    selectStarterCharacter(selectedInterimForCustomOrder);
  }

  // If wizard is open, move to next step
  if (typeof nextStep === 'function' && document.getElementById('onboardingWizardModal')?.classList.contains('active')) {
    // The character is already selected, so just continue
    if (typeof handleCharacterContinue === 'function') {
      handleCharacterContinue();
    }
  }
}

// Skip interim character selection
function skipInterimCharacter() {
  closeCustomCharacterOrderModal();

  // If in wizard, just re-render current step so they can continue manually
  if (typeof renderCurrentStep === 'function' && document.getElementById('onboardingWizardModal')?.classList.contains('active')) {
    renderCurrentStep();
  }
}

// Helper function (ensure it exists)
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===========================================
// EXPOSED FUNCTIONS FOR WIZARD INTEGRATION
// ===========================================

const CUSTOM_ORDER_STORAGE_KEY = 'vixxxen_pending_custom_order';

// Get the submitted custom character order (for wizard review step)
// Checks both memory and localStorage for persistence across page refreshes
function getSubmittedCustomCharacterOrder() {
  // First check memory
  if (submittedCustomCharacterOrder) {
    return submittedCustomCharacterOrder;
  }
  // Fall back to localStorage
  try {
    const stored = localStorage.getItem(CUSTOM_ORDER_STORAGE_KEY);
    if (stored) {
      submittedCustomCharacterOrder = JSON.parse(stored);
      return submittedCustomCharacterOrder;
    }
  } catch (e) {
    console.error('Error reading custom order from localStorage:', e);
  }
  return null;
}

// Save the submitted order (called after successful submission)
function saveSubmittedCustomCharacterOrder(order) {
  submittedCustomCharacterOrder = order;
  try {
    localStorage.setItem(CUSTOM_ORDER_STORAGE_KEY, JSON.stringify(order));
    console.log('✅ Custom order saved to localStorage:', order.order_number);
  } catch (e) {
    console.error('Error saving custom order to localStorage:', e);
  }
}

// Clear the submitted order (e.g., when starting fresh or after checkout)
function clearSubmittedCustomCharacterOrder() {
  submittedCustomCharacterOrder = null;
  try {
    localStorage.removeItem(CUSTOM_ORDER_STORAGE_KEY);
    console.log('🧹 Custom order cleared from localStorage');
  } catch (e) {
    console.error('Error clearing custom order from localStorage:', e);
  }
}

// Expose functions globally
window.getSubmittedCustomCharacterOrder = getSubmittedCustomCharacterOrder;
window.clearSubmittedCustomCharacterOrder = clearSubmittedCustomCharacterOrder;
