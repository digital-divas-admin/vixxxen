// ===========================================
// ADMIN REPORTS DASHBOARD
// ===========================================
// Depends on: config.js (API_BASE_URL, currentUser), utils.js (escapeHtml)
// Note: isUserAdmin is set by auth state handler in main script

// Load reports for admin dashboard
async function loadAdminReports() {
  if (!isUserAdmin) return;

  const status = document.getElementById('reportStatusFilter')?.value || 'pending';
  const contentType = document.getElementById('reportTypeFilter')?.value || '';

  try {
    // Load stats
    const statsResponse = await fetch(`${API_BASE_URL}/api/reports/stats`);
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      document.getElementById('pendingReportsCount').textContent = stats.by_status?.pending || 0;
      document.getElementById('reviewingReportsCount').textContent = stats.by_status?.reviewing || 0;
      document.getElementById('resolvedReportsCount').textContent = stats.by_status?.resolved || 0;
      document.getElementById('autoHiddenCount').textContent = stats.auto_hidden_pending || 0;
    }

    // Load reports list
    let url = `${API_BASE_URL}/api/reports?is_admin=true&limit=50`;
    if (status) url += `&status=${status}`;
    if (contentType) url += `&content_type=${contentType}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to load reports');

    const data = await response.json();
    renderReportsList(data.reports);

  } catch (error) {
    console.error('Error loading reports:', error);
    document.getElementById('reportsList').innerHTML = `
      <div style="text-align: center; padding: 40px; color: #ff4444;">
        Failed to load reports. Please try again.
      </div>
    `;
  }
}

// Render reports list
function renderReportsList(reports) {
  const container = document.getElementById('reportsList');

  if (!reports || reports.length === 0) {
    container.innerHTML = `
      <div class="reports-empty-state" style="text-align: center; padding: 60px 20px; background: linear-gradient(135deg, rgba(74, 222, 128, 0.05), rgba(74, 222, 128, 0.02)); border: 1px solid rgba(74, 222, 128, 0.15); border-radius: 16px;">
        <div style="font-size: 4rem; margin-bottom: 16px;">✅</div>
        <div style="font-size: 1.3rem; font-weight: 600; color: #4ade80; margin-bottom: 8px;">All Clear!</div>
        <div style="color: #888; font-size: 0.95rem;">No content reports to review at this time.</div>
      </div>
    `;
    return;
  }

  const reasonLabels = {
    illegal_content: '🚨 Illegal Content',
    underage_depiction: '⚠️ Underage Depiction',
    non_consensual: '🚫 Non-consensual',
    harassment: '😠 Harassment',
    hate_speech: '🗣️ Hate Speech',
    impersonation: '🎭 Impersonation',
    spam: '📧 Spam',
    other: '❓ Other'
  };

  const typeIcons = {
    image: '🖼️',
    video: '🎬',
    audio: '🔊',
    chat_message: '💬'
  };

  const statusColors = {
    pending: '#ffa500',
    reviewing: '#00b2ff',
    resolved: '#4ade80',
    dismissed: '#888'
  };

  container.innerHTML = reports.map(report => {
    const date = new Date(report.created_at).toLocaleDateString();
    const time = new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="report-item" style="background: #252525; border-radius: 12px; padding: 20px; border-left: 4px solid ${statusColors[report.status]};">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
          <div>
            <span style="font-size: 1.1rem; margin-right: 8px;">${typeIcons[report.content_type] || '📄'}</span>
            <span style="color: #fff; font-weight: 600;">${reasonLabels[report.reason] || report.reason}</span>
            ${report.auto_hidden ? '<span style="background: #ff4444; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; margin-left: 8px;">AUTO-HIDDEN</span>' : ''}
          </div>
          <span style="color: #888; font-size: 0.85rem;">${date} ${time}</span>
        </div>

        ${report.details ? `<p style="color: #aaa; margin-bottom: 12px; font-size: 0.9rem;">${escapeHtml(report.details)}</p>` : ''}

        ${report.content_url ? `
          <div style="margin-bottom: 12px;">
            ${report.content_type === 'image' ? `<img src="${report.content_url}" style="max-width: 200px; max-height: 150px; border-radius: 8px; cursor: pointer;" onclick="window.open('${report.content_url}', '_blank')">` : ''}
            ${report.content_type === 'video' ? `<video src="${report.content_url}" style="max-width: 200px; max-height: 150px; border-radius: 8px;" controls></video>` : ''}
          </div>
        ` : ''}

        ${report.content_preview ? `<p style="color: #888; font-size: 0.85rem; font-style: italic; margin-bottom: 12px;">"${escapeHtml(report.content_preview)}"</p>` : ''}

        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${report.status === 'pending' ? `
            <button onclick="updateReportStatus('${report.id}', 'reviewing')" style="padding: 8px 16px; background: #00b2ff; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 0.85rem;">Start Review</button>
          ` : ''}
          ${report.status === 'reviewing' ? `
            <button onclick="updateReportStatus('${report.id}', 'resolved', 'content_removed')" style="padding: 8px 16px; background: #ff4444; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 0.85rem;">Remove Content</button>
            <button onclick="updateReportStatus('${report.id}', 'resolved', 'warning')" style="padding: 8px 16px; background: #ffa500; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 0.85rem;">Warn User</button>
            <button onclick="updateReportStatus('${report.id}', 'dismissed', 'none')" style="padding: 8px 16px; background: #666; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 0.85rem;">Dismiss</button>
          ` : ''}
          ${report.status === 'resolved' || report.status === 'dismissed' ? `
            <span style="color: #888; font-size: 0.85rem;">Action: ${report.action_taken || 'None'}</span>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Update report status
async function updateReportStatus(reportId, status, action = null) {
  if (!isUserAdmin || !currentUser) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/reports/${reportId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_user_id: currentUser.id,
        status: status,
        action_taken: action,
        notify_reporter: status === 'resolved' || status === 'dismissed'
      })
    });

    if (!response.ok) throw new Error('Failed to update report');

    const data = await response.json();

    // Show confirmation for content removal
    if (data.content_removed) {
      alert('Content has been removed from the database.');
    }

    // Reload reports
    loadAdminReports();

  } catch (error) {
    console.error('Error updating report:', error);
    alert('Failed to update report. Please try again.');
  }
}

// ===========================================
// BLOCKED WORDS ADMIN MANAGEMENT
// ===========================================

let adminBlockedWords = []; // Cache for admin view
let blockedWordsPanelOpen = false; // Track panel state

// Toggle blocked words panel visibility
function toggleBlockedWordsPanel() {
  const panel = document.getElementById('blockedWordsPanel');
  const icon = document.getElementById('blockedWordsToggleIcon');
  const toggle = document.getElementById('blockedWordsToggle');

  blockedWordsPanelOpen = !blockedWordsPanelOpen;

  if (blockedWordsPanelOpen) {
    panel.style.display = 'block';
    icon.style.transform = 'rotate(180deg)';
    toggle.style.background = 'rgba(157, 78, 221, 0.1)';
    toggle.style.borderColor = 'rgba(157, 78, 221, 0.5)';
  } else {
    panel.style.display = 'none';
    icon.style.transform = 'rotate(0deg)';
    toggle.style.background = 'rgba(255,255,255,0.02)';
    toggle.style.borderColor = 'rgba(157, 78, 221, 0.3)';
  }
}

// Load blocked words for admin dashboard
async function loadBlockedWordsAdmin() {
  if (!isUserAdmin) return;

  const category = document.getElementById('categoryFilter')?.value || 'all';
  const appliesTo = document.getElementById('appliesToFilter')?.value || 'all';

  try {
    let url = `${API_BASE_URL}/api/content-filter/admin/words`;
    const params = [];
    if (category && category !== 'all') {
      params.push(`category=${category}`);
    }
    if (appliesTo && appliesTo !== 'all') {
      params.push(`applies_to=${appliesTo}`);
    }
    if (params.length > 0) {
      url += '?' + params.join('&');
    }

    const response = await authFetch(url);
    if (!response.ok) throw new Error('Failed to load blocked words');

    const data = await response.json();
    adminBlockedWords = data.words || [];

    // Update stats
    const total = adminBlockedWords.length;
    const active = adminBlockedWords.filter(w => w.is_active).length;
    const inactive = total - active;

    document.getElementById('totalBlockedWords').textContent = total;
    document.getElementById('activeBlockedWords').textContent = active;
    document.getElementById('inactiveBlockedWords').textContent = inactive;

    // Update toggle button count
    const toggleCount = document.getElementById('blockedWordsToggleCount');
    if (toggleCount) {
      toggleCount.textContent = `${total} word${total !== 1 ? 's' : ''}`;
    }

    // Render the words list
    renderBlockedWordsList(adminBlockedWords);

  } catch (error) {
    console.error('Error loading blocked words:', error);
    document.getElementById('blockedWordsList').innerHTML = `
      <div style="text-align: center; padding: 40px; color: #ff4444; width: 100%;">
        Failed to load blocked words. Please try again.
      </div>
    `;
  }
}

// Render blocked words as tags
function renderBlockedWordsList(words) {
  const container = document.getElementById('blockedWordsList');
  const searchTerm = document.getElementById('searchBlockedWords')?.value?.toLowerCase() || '';

  // Filter by search term if present
  const filteredWords = searchTerm
    ? words.filter(w => w.word.toLowerCase().includes(searchTerm))
    : words;

  if (!filteredWords || filteredWords.length === 0) {
    container.innerHTML = `
      <div class="blocked-words-empty" style="text-align: center; padding: 40px 20px; width: 100%;">
        <div style="font-size: 3rem; margin-bottom: 12px;">📝</div>
        <div style="color: #888; font-size: 0.95rem;">${searchTerm ? 'No words match your search.' : 'No blocked words found. Add some above!'}</div>
      </div>
    `;
    return;
  }

  const categoryColors = {
    explicit: '#ff2ebb',
    celebrities: '#00b2ff',
    violence: '#ff4444',
    other: '#ffa500'
  };

  const appliesToLabels = {
    safe: '🔒 Safe',
    nsfw: '🔞 NSFW',
    both: '🔒🔞 Both'
  };

  const appliesToColors = {
    safe: '#4ade80',
    nsfw: '#ff2ebb',
    both: '#ffa500'
  };

  container.innerHTML = filteredWords.map(word => {
    const color = categoryColors[word.category] || '#9d4edd';
    const opacity = word.is_active ? '1' : '0.5';
    const appliesTo = word.applies_to || 'safe';
    const appliesToColor = appliesToColors[appliesTo] || '#888';

    return `
      <div class="blocked-word-tag" data-id="${word.id}" style="
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: ${word.is_active ? `rgba(${hexToRgb(color)}, 0.15)` : 'rgba(100, 100, 100, 0.15)'};
        border: 1px solid ${word.is_active ? color : '#666'};
        border-radius: 20px;
        font-size: 0.85rem;
        opacity: ${opacity};
        transition: all 0.2s;
      ">
        <span style="color: ${word.is_active ? '#fff' : '#888'};">${escapeHtml(word.word)}</span>
        <span style="font-size: 0.7rem; color: #888; text-transform: uppercase;">${word.category}</span>
        <span style="font-size: 0.65rem; color: ${appliesToColor}; padding: 2px 6px; background: rgba(${hexToRgb(appliesToColor)}, 0.2); border-radius: 4px;">${appliesToLabels[appliesTo] || appliesTo}</span>
        <button onclick="toggleBlockedWord('${word.id}', ${!word.is_active})" title="${word.is_active ? 'Deactivate' : 'Activate'}" style="
          background: none;
          border: none;
          cursor: pointer;
          font-size: 0.9rem;
          padding: 2px;
          opacity: 0.7;
          transition: opacity 0.2s;
        " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
          ${word.is_active ? '⏸️' : '▶️'}
        </button>
        <button onclick="deleteBlockedWord('${word.id}', '${escapeHtml(word.word)}')" title="Delete" style="
          background: none;
          border: none;
          cursor: pointer;
          font-size: 0.9rem;
          padding: 2px;
          opacity: 0.7;
          transition: opacity 0.2s;
        " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
          🗑️
        </button>
      </div>
    `;
  }).join('');
}

// Helper to convert hex to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '157, 78, 221';
}

// Filter blocked words list (client-side search)
function filterBlockedWordsList() {
  renderBlockedWordsList(adminBlockedWords);
}

// Add a new blocked word
async function addBlockedWord() {
  if (!isUserAdmin) return;

  const wordInput = document.getElementById('newBlockedWord');
  const categorySelect = document.getElementById('newWordCategory');
  const appliesToSelect = document.getElementById('newWordAppliesTo');

  const word = wordInput?.value?.trim();
  const category = categorySelect?.value || 'explicit';
  const applies_to = appliesToSelect?.value || 'safe';

  if (!word) {
    alert('Please enter a word or phrase.');
    return;
  }

  try {
    const response = await authFetch(`${API_BASE_URL}/api/content-filter/admin/words`, {
      method: 'POST',
      body: JSON.stringify({ word, category, applies_to })
    });

    if (response.status === 409) {
      alert('This word already exists in the blocked list.');
      return;
    }

    if (!response.ok) throw new Error('Failed to add word');

    // Clear input and reload
    wordInput.value = '';
    loadBlockedWordsAdmin();

    // Refresh frontend cache
    if (typeof loadBlockedWords === 'function') {
      loadBlockedWords();
    }

  } catch (error) {
    console.error('Error adding blocked word:', error);
    alert('Failed to add word. Please try again.');
  }
}

// Toggle blocked word active status
async function toggleBlockedWord(id, newStatus) {
  if (!isUserAdmin) return;

  try {
    const response = await authFetch(`${API_BASE_URL}/api/content-filter/admin/words/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: newStatus })
    });

    if (!response.ok) throw new Error('Failed to update word');

    // Reload list
    loadBlockedWordsAdmin();

    // Refresh frontend cache
    if (typeof loadBlockedWords === 'function') {
      loadBlockedWords();
    }

  } catch (error) {
    console.error('Error toggling blocked word:', error);
    alert('Failed to update word. Please try again.');
  }
}

// Delete a blocked word
async function deleteBlockedWord(id, word) {
  if (!isUserAdmin) return;

  if (!confirm(`Are you sure you want to delete "${word}" from the blocked list?`)) {
    return;
  }

  try {
    const response = await authFetch(`${API_BASE_URL}/api/content-filter/admin/words/${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) throw new Error('Failed to delete word');

    // Reload list
    loadBlockedWordsAdmin();

    // Refresh frontend cache
    if (typeof loadBlockedWords === 'function') {
      loadBlockedWords();
    }

  } catch (error) {
    console.error('Error deleting blocked word:', error);
    alert('Failed to delete word. Please try again.');
  }
}

// Toggle bulk entry form visibility
function toggleBulkEntry() {
  const form = document.getElementById('bulkEntryForm');
  const toggle = document.getElementById('bulkEntryToggle');

  if (form.style.display === 'none') {
    form.style.display = 'block';
    toggle.textContent = '📋 Hide Bulk Entry';
    toggle.style.background = 'rgba(157, 78, 221, 0.2)';

    // Add input listener to update word count
    const textarea = document.getElementById('bulkBlockedWords');
    textarea.addEventListener('input', updateBulkWordCount);
  } else {
    form.style.display = 'none';
    toggle.textContent = '📋 Bulk Add Multiple Words';
    toggle.style.background = 'transparent';
  }
}

// Update the word count display as user types
function updateBulkWordCount() {
  const textarea = document.getElementById('bulkBlockedWords');
  const countDisplay = document.getElementById('bulkWordCount');
  const words = parseBulkWords(textarea.value);
  countDisplay.textContent = `${words.length} word${words.length !== 1 ? 's' : ''}`;
}

// Parse bulk words from textarea (supports newlines and commas)
function parseBulkWords(text) {
  if (!text || !text.trim()) return [];

  // Split by newlines and commas, then clean up
  return text
    .split(/[\n,]+/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 0);
}

// Add multiple blocked words at once
async function addBulkBlockedWords() {
  if (!isUserAdmin) return;

  const textarea = document.getElementById('bulkBlockedWords');
  const categorySelect = document.getElementById('bulkWordCategory');
  const appliesToSelect = document.getElementById('bulkWordAppliesTo');

  const words = parseBulkWords(textarea.value);
  const category = categorySelect?.value || 'explicit';
  const applies_to = appliesToSelect?.value || 'safe';

  if (words.length === 0) {
    alert('Please enter at least one word.');
    return;
  }

  try {
    const response = await authFetch(`${API_BASE_URL}/api/content-filter/admin/words/bulk`, {
      method: 'POST',
      body: JSON.stringify({ words, category, applies_to })
    });

    if (!response.ok) throw new Error('Failed to add words');

    const data = await response.json();

    // Show result
    alert(`Added ${data.added} of ${data.requested} words.\n${data.requested - data.added > 0 ? `(${data.requested - data.added} were duplicates)` : ''}`);

    // Clear textarea and hide form
    textarea.value = '';
    updateBulkWordCount();
    toggleBulkEntry();

    // Reload list
    loadBlockedWordsAdmin();

    // Refresh frontend cache
    if (typeof loadBlockedWords === 'function') {
      loadBlockedWords();
    }

  } catch (error) {
    console.error('Error adding bulk words:', error);
    alert('Failed to add words. Please try again.');
  }
}

// ===========================================
// Character Grants Admin Functions
// ===========================================

let selectedGrantUserId = null;
let allCharacters = [];

async function loadCharacterGrantsData() {
  try {
    const response = await authFetch('/api/admin/characters');
    if (response.ok) {
      const data = await response.json();
      allCharacters = data.characters || [];
      populateCharacterSelect();
    }
  } catch (error) {
    console.error('Error loading characters:', error);
  }
}

function populateCharacterSelect() {
  const select = document.getElementById('grantCharacterSelect');
  if (!select) return;

  select.innerHTML = '<option value="">Select a character...</option>';
  allCharacters.forEach(char => {
    const option = document.createElement('option');
    option.value = char.id;
    option.textContent = `${char.name} (${char.category})`;
    select.appendChild(option);
  });
}

async function searchUserForGrant() {
  const searchInput = document.getElementById('grantUserSearch');
  const resultsDiv = document.getElementById('grantUserSearchResults');

  const email = searchInput.value.trim();
  if (!email) {
    alert('Please enter an email to search');
    return;
  }

  try {
    const response = await authFetch(`/api/admin/users/search?email=${encodeURIComponent(email)}`);
    if (!response.ok) throw new Error('Search failed');

    const data = await response.json();
    const users = data.users || [];

    if (users.length === 0) {
      resultsDiv.innerHTML = '<div style="color: #888; text-align: center; padding: 12px;">No users found</div>';
      resultsDiv.style.display = 'block';
      return;
    }

    resultsDiv.innerHTML = users.map(user => `
      <div onclick="selectUserForGrant('${user.id}', '${user.email}', '${user.plan || 'free'}', '${user.role || 'user'}')"
           style="padding: 12px; border-radius: 8px; cursor: pointer; transition: background 0.2s; display: flex; justify-content: space-between; align-items: center;"
           onmouseover="this.style.background='rgba(157, 78, 221, 0.1)'"
           onmouseout="this.style.background='transparent'">
        <div>
          <div style="font-weight: 500; color: #fff;">${user.email}</div>
          <div style="font-size: 0.8rem; color: #888;">Plan: ${user.plan || 'free'} | Role: ${user.role || 'user'}</div>
        </div>
        <span style="color: #9d4edd;">Select</span>
      </div>
    `).join('');

    resultsDiv.style.display = 'block';
  } catch (error) {
    console.error('Error searching users:', error);
    alert('Failed to search users. Please try again.');
  }
}

async function selectUserForGrant(userId, email, plan, role) {
  selectedGrantUserId = userId;

  document.getElementById('grantUserSearchResults').style.display = 'none';
  document.getElementById('grantUserSelected').style.display = 'block';
  document.getElementById('grantUserEmail').textContent = email;
  document.getElementById('grantUserInfo').textContent = `Plan: ${plan} | Role: ${role}`;

  await loadUserCharacters(userId);
}

function clearSelectedUser() {
  selectedGrantUserId = null;
  document.getElementById('grantUserSelected').style.display = 'none';
  document.getElementById('grantUserSearch').value = '';
  document.getElementById('grantUserCharacters').innerHTML = '<div style="color: #888; font-size: 0.9rem;">Select a user to view their characters</div>';
}

async function loadUserCharacters(userId) {
  const container = document.getElementById('grantUserCharacters');
  container.innerHTML = '<div style="color: #888;">Loading...</div>';

  try {
    const response = await authFetch(`/api/admin/users/${userId}/characters`);
    if (!response.ok) throw new Error('Failed to load characters');

    const data = await response.json();
    const ownedCharacters = data.ownedCharacters || [];

    if (ownedCharacters.length === 0) {
      container.innerHTML = '<div style="color: #888; font-size: 0.9rem;">No characters owned</div>';
      return;
    }

    container.innerHTML = ownedCharacters.map(uc => {
      const char = uc.character;
      const isAdminGrant = uc.amount_paid === 0 || uc.amount_paid === '0' || uc.amount_paid === null;
      return `
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);">
          ${char.image_url ? `<img src="${char.image_url}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover;">` : '<div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(157, 78, 221, 0.2); display: flex; align-items: center; justify-content: center;">🎭</div>'}
          <div style="flex: 1;">
            <div style="font-weight: 500; color: #fff;">${char.name}</div>
            <div style="font-size: 0.75rem; color: #888;">${char.category}${isAdminGrant ? ' • Admin Grant' : ''}</div>
          </div>
          <button onclick="revokeCharacterAccess('${char.id}', '${char.name}')" style="padding: 6px 12px; background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; color: #ef4444; cursor: pointer; font-size: 0.8rem;">
            Revoke
          </button>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading user characters:', error);
    container.innerHTML = '<div style="color: #ef4444; font-size: 0.9rem;">Failed to load characters</div>';
  }
}

async function grantCharacterAccess() {
  if (!selectedGrantUserId) {
    alert('Please select a user first');
    return;
  }

  const select = document.getElementById('grantCharacterSelect');
  const characterId = select.value;

  if (!characterId) {
    alert('Please select a character to grant');
    return;
  }

  try {
    const response = await authFetch('/api/admin/grant-character', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: selectedGrantUserId, characterId })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || 'Failed to grant character access');
      return;
    }

    alert('Character access granted successfully!');
    select.value = '';
    await loadUserCharacters(selectedGrantUserId);
  } catch (error) {
    console.error('Error granting character:', error);
    alert('Failed to grant character access. Please try again.');
  }
}

async function revokeCharacterAccess(characterId, characterName) {
  if (!selectedGrantUserId) return;

  if (!confirm(`Are you sure you want to revoke access to "${characterName}"?`)) {
    return;
  }

  try {
    const response = await authFetch('/api/admin/revoke-character', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: selectedGrantUserId, characterId })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || 'Failed to revoke character access');
      return;
    }

    alert('Character access revoked.');
    await loadUserCharacters(selectedGrantUserId);
  } catch (error) {
    console.error('Error revoking character:', error);
    alert('Failed to revoke character access. Please try again.');
  }
}
