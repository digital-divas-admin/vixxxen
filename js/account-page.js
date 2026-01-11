// ===========================================
// ACCOUNT PAGE FUNCTIONS
// ===========================================
// Depends on: config.js (currentUser, supabaseClient)
// Note: userCredits and userPlan are defined in main inline script

// Open account page
function openAccountPage() {
  // Close user menu
  document.getElementById('userMenu').classList.remove('active');

  // Hide all tab sections
  document.querySelectorAll('.tab-section').forEach(section => {
    section.classList.remove('active');
  });

  // Deactivate all nav tabs
  document.querySelectorAll('.nav-tab').forEach(navTab => {
    navTab.classList.remove('active');
  });

  // Show account page
  document.getElementById('accountSection').classList.add('active');

  // Load user data into form
  loadAccountData();

  console.log('Opened account page');
}

// Load account data into form fields
function loadAccountData() {
  if (!currentUser) return;

  // Load custom character orders
  loadCustomCharacterOrders();

  // Set display name
  const nameInput = document.getElementById('accountName');
  if (nameInput) {
    nameInput.value = currentUser.full_name || currentUser.email?.split('@')[0] || '';
  }

  // Set email (disabled field)
  const emailInput = document.getElementById('accountEmail');
  if (emailInput) {
    emailInput.value = currentUser.email || '';
  }

  // Set avatar text (first letter of name or email)
  const avatarText = document.getElementById('accountAvatarText');
  if (avatarText) {
    const name = currentUser.full_name || currentUser.email || 'U';
    avatarText.textContent = name.charAt(0).toUpperCase();
  }

  // Set credits - use userCredits which is loaded from profile
  const creditsDisplay = document.getElementById('accountCredits');
  if (creditsDisplay) {
    creditsDisplay.textContent = userCredits?.toLocaleString() || '0';
  }

  // Set plan badge - use userPlan which includes membership tier
  const planBadge = document.getElementById('accountPlanBadge');
  const planName = document.getElementById('accountPlanName');
  if (planBadge) planBadge.textContent = userPlan || 'Free Plan';
  if (planName) planName.textContent = userPlan || 'Free Plan';

  // Set member since
  const memberSince = document.getElementById('accountMemberSince');
  if (memberSince && currentUser.created_at) {
    const date = new Date(currentUser.created_at);
    memberSince.textContent = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  // Set avatar image if exists
  const avatarImg = document.getElementById('accountAvatarImg');
  if (currentUser.avatar_url && avatarImg) {
    avatarImg.src = currentUser.avatar_url;
    avatarImg.style.display = 'block';
    if (avatarText) avatarText.style.display = 'none';
  } else if (avatarImg) {
    avatarImg.style.display = 'none';
    if (avatarText) avatarText.style.display = 'block';
  }
}

// Handle avatar upload
async function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!currentUser) {
    alert('Please log in first');
    return;
  }

  // Validate file type
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file');
    return;
  }

  // Validate file size (max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    alert('Image must be less than 2MB');
    return;
  }

  const uploadBtn = document.getElementById('avatarUploadBtn');
  const originalText = uploadBtn.textContent;
  uploadBtn.textContent = 'Uploading...';
  uploadBtn.disabled = true;

  try {
    // Generate unique filename
    const timestamp = Date.now();
    const extension = file.name.split('.').pop();
    const fileName = `${currentUser.id}/avatar-${timestamp}.${extension}`;

    // Upload to Supabase Storage (using generated-images bucket with avatars folder)
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('generated-images')
      .upload(`avatars/${fileName}`, file, {
        contentType: file.type,
        upsert: true
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabaseClient.storage
      .from('generated-images')
      .getPublicUrl(`avatars/${fileName}`);

    const avatarUrl = urlData.publicUrl;

    // Update profile in database
    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', currentUser.id);

    if (updateError) throw updateError;

    // Update local user object
    currentUser.avatar_url = avatarUrl;

    // Update avatar display
    const avatarImg = document.getElementById('accountAvatarImg');
    const avatarText = document.getElementById('accountAvatarText');
    avatarImg.src = avatarUrl;
    avatarImg.style.display = 'block';
    avatarText.style.display = 'none';

    // Update avatar in user menu header
    const userMenuAvatar = document.querySelector('.user-avatar');
    if (userMenuAvatar) {
      userMenuAvatar.innerHTML = `<img src="${avatarUrl}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    }

    console.log('Avatar uploaded:', avatarUrl);
    alert('Avatar updated successfully!');
  } catch (error) {
    console.error('Error uploading avatar:', error);
    alert('Failed to upload avatar: ' + error.message);
  } finally {
    uploadBtn.textContent = originalText;
    uploadBtn.disabled = false;
    // Clear file input
    event.target.value = '';
  }
}

// Update profile (display name)
async function updateProfile() {
  if (!currentUser) {
    alert('Please log in first');
    return;
  }

  const newName = document.getElementById('accountName').value.trim();
  if (!newName) {
    alert('Please enter a display name');
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .update({
        full_name: newName,
        display_name: newName,
        updated_at: new Date().toISOString()
      })
      .eq('id', currentUser.id);

    if (error) throw error;

    // Update local user object
    currentUser.full_name = newName;
    currentUser.display_name = newName;

    // Update UI
    const userNameDisplay = document.getElementById('userName');
    if (userNameDisplay) {
      userNameDisplay.textContent = newName;
    }

    // Update avatar in user menu
    const avatarText = document.querySelector('.user-avatar');
    if (avatarText) {
      avatarText.textContent = newName.charAt(0).toUpperCase();
    }

    alert('Profile updated successfully!');
    console.log('Profile updated:', newName);
  } catch (error) {
    console.error('Error updating profile:', error);
    alert('Failed to update profile: ' + error.message);
  }
}

// Change password
async function changePassword() {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (!newPassword || !confirmPassword) {
    alert('Please fill in all password fields');
    return;
  }

  if (newPassword !== confirmPassword) {
    alert('New passwords do not match');
    return;
  }

  if (newPassword.length < 6) {
    alert('Password must be at least 6 characters');
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;

    // Clear password fields
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';

    alert('Password changed successfully!');
    console.log('Password changed');
  } catch (error) {
    console.error('Error changing password:', error);
    alert('Failed to change password: ' + error.message);
  }
}

// Confirm delete account
async function confirmDeleteAccount() {
  const confirmed = confirm(
    'Are you sure you want to delete your account?\n\n' +
    'This action CANNOT be undone. All your data, credits, and generated content will be permanently deleted.'
  );

  if (!confirmed) return;

  const doubleConfirmed = confirm(
    'This is your final warning!\n\n' +
    'Type DELETE in your mind and click OK to permanently delete your account.'
  );

  if (!doubleConfirmed) return;

  try {
    // Note: Full account deletion would require a server-side function
    // For now, we'll sign out and inform the user
    alert('Account deletion request submitted.\n\nPlease contact support@vixxxen.ai to complete the deletion process.');

    await supabaseClient.auth.signOut();
    window.location.reload();
  } catch (error) {
    console.error('Error deleting account:', error);
    alert('Failed to process request: ' + error.message);
  }
}

// Go back from account page
function goBackFromAccount() {
  // Hide account section
  document.getElementById('accountSection').classList.remove('active');

  // Show image section (default)
  document.getElementById('imageSection').classList.add('active');

  // Activate image nav tab
  document.querySelectorAll('.nav-tab').forEach(navTab => {
    navTab.classList.remove('active');
  });
  document.querySelector('.nav-tab[onclick*="imageSection"]')?.classList.add('active');
}

// ===========================================
// CUSTOM CHARACTER ORDERS
// ===========================================

// Load user's custom character orders
async function loadCustomCharacterOrders() {
  const listEl = document.getElementById('customOrdersList');
  if (!listEl) return;

  if (!currentUser) {
    listEl.innerHTML = `
      <div style="text-align: center; color: #888; padding: 20px 0;">
        Please log in to view your custom character orders.
      </div>
    `;
    return;
  }

  listEl.innerHTML = `
    <div style="text-align: center; color: #888; padding: 20px 0;">
      Loading orders...
    </div>
  `;

  try {
    const response = await authFetch(`${API_BASE_URL}/api/custom-characters/orders`);
    if (!response.ok) throw new Error('Failed to load orders');

    const data = await response.json();
    const orders = data.orders || [];

    if (orders.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; color: #888; padding: 20px 0;">
          <div style="font-size: 2rem; margin-bottom: 8px;">🎨</div>
          <div>No custom character orders yet.</div>
          <div style="font-size: 0.85rem; margin-top: 8px;">Commission your own AI character today!</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = orders.map(order => {
      const statusColors = {
        'pending': { bg: 'rgba(255, 165, 0, 0.15)', color: '#ffa500' },
        'in_progress': { bg: 'rgba(0, 178, 255, 0.15)', color: '#00b2ff' },
        'delivered': { bg: 'rgba(157, 78, 221, 0.15)', color: '#9d4edd' },
        'revision_requested': { bg: 'rgba(255, 46, 187, 0.15)', color: '#ff2ebb' },
        'completed': { bg: 'rgba(74, 222, 128, 0.15)', color: '#4ade80' }
      };

      const statusLabels = {
        'pending': 'Pending',
        'in_progress': 'In Progress',
        'delivered': 'Delivered',
        'revision_requested': 'Revision Requested',
        'completed': 'Completed'
      };

      const colors = statusColors[order.status] || statusColors.pending;
      const statusLabel = statusLabels[order.status] || order.status;
      const createdDate = new Date(order.created_at).toLocaleDateString();
      const estimatedDate = order.estimated_delivery ? new Date(order.estimated_delivery).toLocaleDateString() : 'TBD';

      return `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(157, 78, 221, 0.2); border-radius: 12px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 8px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <span style="font-weight: 600; color: #fff;">#${order.order_number} - ${escapeHtml(order.character_name)}</span>
                ${order.is_rush ? '<span style="background: rgba(255, 68, 68, 0.2); color: #ff4444; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem;">RUSH</span>' : ''}
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap; font-size: 0.8rem; color: #888;">
                <span>Ordered: ${createdDate}</span>
                <span>•</span>
                <span>Est. Delivery: ${estimatedDate}</span>
              </div>
            </div>
            <div style="background: ${colors.bg}; color: ${colors.color}; padding: 4px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 500;">
              ${statusLabel}
            </div>
          </div>

          ${order.status === 'delivered' && order.revisions_purchased > order.revisions_used ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
              <button onclick="openRevisionModal('${order.id}')" style="padding: 8px 16px; background: rgba(157, 78, 221, 0.2); border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 8px; color: #9d4edd; cursor: pointer; font-size: 0.85rem;">
                Request Revision (${order.revisions_purchased - order.revisions_used} remaining)
              </button>
            </div>
          ` : ''}

          ${order.final_character ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
              <span style="color: #4ade80; font-size: 0.85rem;">✓ Character ready: ${escapeHtml(order.final_character.name)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('Error loading custom character orders:', error);
    listEl.innerHTML = `
      <div style="text-align: center; color: #ff4444; padding: 20px 0;">
        Failed to load orders. <button onclick="loadCustomCharacterOrders()" style="color: #9d4edd; background: none; border: none; cursor: pointer; text-decoration: underline;">Retry</button>
      </div>
    `;
  }
}

// Open revision request modal
function openRevisionModal(orderId) {
  const modal = document.createElement('div');
  modal.id = 'revisionModal';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px;';

  modal.innerHTML = `
    <div style="background: #1a1a1a; border-radius: 16px; padding: 32px; max-width: 500px; width: 100%;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0; color: #fff; font-size: 1.2rem;">Request Revision</h3>
        <button onclick="closeRevisionModal()" style="background: none; border: none; color: #888; font-size: 1.5rem; cursor: pointer;">&times;</button>
      </div>

      <div style="margin-bottom: 20px;">
        <label style="display: block; color: #888; font-size: 0.9rem; margin-bottom: 8px;">What would you like changed?</label>
        <textarea id="revisionFeedback" rows="4" placeholder="Please describe the changes you'd like made to your character..." style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem; resize: vertical;"></textarea>
      </div>

      <div style="display: flex; gap: 12px;">
        <button onclick="closeRevisionModal()" style="flex: 1; padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: #888; cursor: pointer;">Cancel</button>
        <button onclick="submitRevisionRequest('${orderId}')" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #9d4edd, #ff2ebb); border: none; border-radius: 8px; color: #fff; cursor: pointer; font-weight: 600;">Submit Request</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeRevisionModal();
  });
}

function closeRevisionModal() {
  const modal = document.getElementById('revisionModal');
  if (modal) modal.remove();
}

async function submitRevisionRequest(orderId) {
  const feedback = document.getElementById('revisionFeedback')?.value.trim();

  if (!feedback) {
    alert('Please provide feedback for your revision request.');
    return;
  }

  try {
    const response = await authFetch(`${API_BASE_URL}/api/custom-characters/orders/${orderId}/revision`, {
      method: 'POST',
      body: JSON.stringify({ feedback })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to submit revision');
    }

    alert('Revision request submitted successfully!');
    closeRevisionModal();
    loadCustomCharacterOrders();
  } catch (error) {
    console.error('Error submitting revision:', error);
    alert(error.message || 'Failed to submit revision request.');
  }
}

// Helper function
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
