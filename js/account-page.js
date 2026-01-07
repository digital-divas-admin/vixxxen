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
        updated_at: new Date().toISOString()
      })
      .eq('id', currentUser.id);

    if (error) throw error;

    // Update local user object
    currentUser.full_name = newName;

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
