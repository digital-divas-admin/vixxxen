/**
 * Admin Characters Management
 * Handles creation, editing, and management of marketplace characters and private LoRAs
 */

(function() {
  'use strict';

  console.log('👤 Admin Characters module loaded');

  let allAdminCharacters = [];
  let editingCharacterId = null;

  // Load all characters for admin - using unique name to avoid conflict with admin-onboarding.js
  window.loadCharactersManagement = async function() {
    console.log('👤 loadCharactersManagement called');
    const container = document.getElementById('adminCharactersList');
    console.log('👤 Container found:', !!container);
    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 40px; color: #888; grid-column: 1 / -1;">Loading characters...</div>';

    try {
      console.log('👤 Fetching characters from API...');
      const response = await authFetch(`${API_BASE_URL}/api/characters/all`);
      if (!response.ok) throw new Error('Failed to load characters');

      const data = await response.json();
      allAdminCharacters = data.characters || [];
      console.log('👤 Loaded', allAdminCharacters.length, 'characters');

      renderCharactersList();
    } catch (error) {
      console.error('Error loading admin characters:', error);
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #ff4444; grid-column: 1 / -1;">
          Failed to load characters. <button onclick="loadCharactersManagement()" style="color: #4ade80; background: none; border: none; cursor: pointer; text-decoration: underline;">Retry</button>
        </div>
      `;
    }
  };

  // Render filtered characters list
  window.renderCharactersList = function() {
    const container = document.getElementById('adminCharactersList');
    if (!container) return;

    const searchTerm = document.getElementById('adminCharSearchInput')?.value?.toLowerCase() || '';
    const filterValue = document.getElementById('adminCharListFilter')?.value || 'all';

    let filtered = allAdminCharacters;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(c =>
        c.name?.toLowerCase().includes(searchTerm) ||
        c.category?.toLowerCase().includes(searchTerm) ||
        c.description?.toLowerCase().includes(searchTerm)
      );
    }

    // Apply listed/unlisted filter
    if (filterValue === 'listed') {
      filtered = filtered.filter(c => c.is_listed !== false);
    } else if (filterValue === 'unlisted') {
      filtered = filtered.filter(c => c.is_listed === false);
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #888; grid-column: 1 / -1;">
          ${allAdminCharacters.length === 0 ? 'No characters yet. Click "Add Character" to create one.' : 'No characters match your search.'}
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(char => `
      <div style="background: rgba(255,255,255,0.03); border-radius: 12px; overflow: hidden; border: 1px solid ${char.is_listed === false ? 'rgba(255, 165, 0, 0.3)' : 'rgba(255,255,255,0.05)'};">
        <!-- Image -->
        <div style="height: 160px; background: #0a0a0a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
          ${char.image_url
            ? `<img src="${char.image_url}" alt="${char.name}" style="width: 100%; height: 100%; object-fit: cover;">`
            : `<span style="font-size: 3rem; opacity: 0.3;">👤</span>`
          }
        </div>

        <!-- Info -->
        <div style="padding: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
            <div>
              <h4 style="margin: 0 0 4px 0; font-size: 1rem; color: #fff;">${char.name}</h4>
              <div style="font-size: 0.8rem; color: #888;">${char.category || 'Uncategorized'}</div>
            </div>
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              ${char.is_listed === false ? '<span style="background: rgba(255, 165, 0, 0.2); color: #ffa500; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem;">PRIVATE</span>' : ''}
              ${char.is_active === false ? '<span style="background: rgba(255, 0, 0, 0.2); color: #ff4444; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem;">INACTIVE</span>' : ''}
              ${char.price > 0 ? `<span style="background: rgba(78, 221, 157, 0.2); color: #4edd9d; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem;">$${char.price}</span>` : '<span style="background: rgba(157, 78, 221, 0.2); color: #9d4edd; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem;">FREE</span>'}
            </div>
          </div>

          ${char.lora_url ? `<div style="font-size: 0.75rem; color: #4ade80; margin-bottom: 8px;">Has LoRA</div>` : ''}

          <!-- Actions -->
          <div style="display: flex; gap: 8px; margin-top: 12px;">
            <button onclick="editAdminCharacter('${char.id}')" style="flex: 1; padding: 8px; background: rgba(157, 78, 221, 0.2); border: none; border-radius: 6px; color: #9d4edd; cursor: pointer; font-size: 0.85rem;">
              Edit
            </button>
            <button onclick="deleteAdminCharacter('${char.id}', '${char.name.replace(/'/g, "\\'")}')" style="padding: 8px 12px; background: rgba(255, 68, 68, 0.1); border: none; border-radius: 6px; color: #ff4444; cursor: pointer; font-size: 0.85rem;">
              Delete
            </button>
          </div>
        </div>
      </div>
    `).join('');
  };

  // Filter characters list
  window.filterCharactersList = function() {
    renderCharactersList();
  };

  // Show add character modal
  window.showAddCharacterModal = function() {
    editingCharacterId = null;
    document.getElementById('adminCharModalTitle').textContent = 'Add New Character';
    document.getElementById('adminCharSubmitBtn').textContent = 'Create Character';
    document.getElementById('adminCharForm').reset();
    document.getElementById('adminCharIsListed').checked = true;
    document.getElementById('adminCharIsActive').checked = true;
    document.getElementById('adminCharModal').style.display = 'flex';
  };

  // Edit character
  window.editAdminCharacter = function(charId) {
    const char = allAdminCharacters.find(c => c.id === charId);
    if (!char) return;

    editingCharacterId = charId;
    document.getElementById('adminCharModalTitle').textContent = 'Edit Character';
    document.getElementById('adminCharSubmitBtn').textContent = 'Save Changes';

    // Populate form
    document.getElementById('adminCharId').value = char.id;
    document.getElementById('adminCharName').value = char.name || '';
    document.getElementById('adminCharCategory').value = char.category || '';
    document.getElementById('adminCharDescription').value = char.description || '';
    document.getElementById('adminCharImageUrl').value = char.image_url || '';
    document.getElementById('adminCharLoraUrl').value = char.lora_url || '';
    document.getElementById('adminCharTriggerWord').value = char.trigger_word || '';
    document.getElementById('adminCharPrice').value = char.price || 0;
    document.getElementById('adminCharIsListed').checked = char.is_listed !== false;
    document.getElementById('adminCharIsActive').checked = char.is_active !== false;

    document.getElementById('adminCharModal').style.display = 'flex';
  };

  // Close character modal
  window.closeAdminCharModal = function() {
    document.getElementById('adminCharModal').style.display = 'none';
    editingCharacterId = null;
  };

  // Save character (create or update)
  window.saveAdminCharacter = async function(event) {
    event.preventDefault();

    const submitBtn = document.getElementById('adminCharSubmitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Saving...';
    submitBtn.disabled = true;

    try {
      const characterData = {
        name: document.getElementById('adminCharName').value.trim(),
        category: document.getElementById('adminCharCategory').value.trim(),
        description: document.getElementById('adminCharDescription').value.trim(),
        image_url: document.getElementById('adminCharImageUrl').value.trim() || null,
        lora_url: document.getElementById('adminCharLoraUrl').value.trim() || null,
        trigger_word: document.getElementById('adminCharTriggerWord').value.trim() || null,
        price: parseFloat(document.getElementById('adminCharPrice').value) || 0,
        is_listed: document.getElementById('adminCharIsListed').checked,
        is_active: document.getElementById('adminCharIsActive').checked
      };

      let response;
      if (editingCharacterId) {
        // Update existing
        response = await authFetch(`${API_BASE_URL}/api/characters/${editingCharacterId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(characterData)
        });
      } else {
        // Create new
        response = await authFetch(`${API_BASE_URL}/api/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(characterData)
        });
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save character');
      }

      closeAdminCharModal();
      await loadCharactersManagement();

      // Show success message
      const action = editingCharacterId ? 'updated' : 'created';
      const listedStatus = characterData.is_listed ? 'listed' : 'private/unlisted';
      alert(`Character ${action} successfully as ${listedStatus}!`);

    } catch (error) {
      console.error('Error saving character:', error);
      alert('Error: ' + error.message);
    } finally {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  };

  // Delete character
  window.deleteAdminCharacter = async function(charId, charName) {
    if (!confirm(`Are you sure you want to delete "${charName}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await authFetch(`${API_BASE_URL}/api/characters/${charId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete character');
      }

      await loadCharactersManagement();
      alert('Character deleted successfully!');

    } catch (error) {
      console.error('Error deleting character:', error);
      alert('Error: ' + error.message);
    }
  };

  // Close modal when clicking outside
  document.addEventListener('click', function(e) {
    const modal = document.getElementById('adminCharModal');
    if (e.target === modal) {
      closeAdminCharModal();
    }
  });

})();
