// ===========================================
// ADMIN CUSTOM CHARACTER ORDERS
// ===========================================
// Depends on: config.js (API_BASE_URL, authFetch)

// State
let customOrdersAdminLoaded = false;
let customOrders = [];
let customConfig = null;
let currentCustomOrdersTab = 'orders';

// ===========================================
// TAB SWITCHING
// ===========================================

function switchCustomOrdersTab(tab) {
  currentCustomOrdersTab = tab;

  // Update tab buttons
  document.querySelectorAll('.custom-orders-tab-btn').forEach(btn => {
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
  document.querySelectorAll('.custom-orders-tab-content').forEach(content => {
    content.style.display = 'none';
    content.classList.remove('active');
  });

  const tabMap = {
    'orders': 'customOrdersOrdersTab',
    'pricing': 'customOrdersPricingTab'
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

async function loadCustomOrdersAdmin() {
  if (customOrdersAdminLoaded) return;

  try {
    await Promise.all([
      loadCustomOrders(),
      loadCustomConfig()
    ]);

    customOrdersAdminLoaded = true;
  } catch (error) {
    console.error('Error loading custom orders admin:', error);
  }
}

// ===========================================
// ORDERS TAB
// ===========================================

async function loadCustomOrders() {
  try {
    // Load stats first
    const statsResponse = await authFetch(`${API_BASE_URL}/api/custom-characters/admin/stats`);
    if (statsResponse.ok) {
      const statsData = await statsResponse.json();
      renderCustomOrdersStats(statsData.stats);
    }

    // Load orders
    const statusFilter = document.getElementById('customOrdersStatusFilter')?.value || 'all';
    const url = `${API_BASE_URL}/api/custom-characters/admin/orders?status=${statusFilter}`;

    const response = await authFetch(url);
    if (!response.ok) throw new Error('Failed to load orders');

    const data = await response.json();
    customOrders = data.orders || [];

    renderCustomOrdersList();
  } catch (error) {
    console.error('Error loading custom orders:', error);
    document.getElementById('customOrdersListContainer').innerHTML = `
      <div style="text-align: center; padding: 40px; color: #ff4444;">
        Failed to load orders. <button onclick="loadCustomOrders()" style="color: #9d4edd; background: none; border: none; cursor: pointer; text-decoration: underline;">Retry</button>
      </div>
    `;
  }
}

function renderCustomOrdersStats(stats) {
  document.getElementById('customOrdersPending').textContent = stats.pending || 0;
  document.getElementById('customOrdersInProgress').textContent = stats.in_progress || 0;
  document.getElementById('customOrdersRevision').textContent = stats.revision_requested || 0;
  document.getElementById('customOrdersCompleted').textContent = stats.completed || 0;

  // Update badge
  const pendingCount = (stats.pending || 0) + (stats.revision_requested || 0);
  const badge = document.getElementById('customOrdersBadge');
  if (badge) {
    if (pendingCount > 0) {
      badge.textContent = pendingCount;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }
}

function renderCustomOrdersList() {
  const container = document.getElementById('customOrdersListContainer');
  const searchTerm = document.getElementById('customOrdersSearch')?.value?.toLowerCase() || '';

  let filteredOrders = customOrders;

  if (searchTerm) {
    filteredOrders = filteredOrders.filter(order =>
      order.user?.email?.toLowerCase().includes(searchTerm) ||
      order.character_name?.toLowerCase().includes(searchTerm) ||
      order.order_number?.toString().includes(searchTerm)
    );
  }

  if (!filteredOrders || filteredOrders.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; background: rgba(255,255,255,0.02); border-radius: 16px;">
        <div style="font-size: 3rem; margin-bottom: 12px;">🎨</div>
        <div style="color: #888; font-size: 0.95rem;">${customOrders.length === 0 ? 'No custom character orders yet.' : 'No orders match your search.'}</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredOrders.map(order => {
    const statusColors = {
      'pending': { bg: 'rgba(255, 165, 0, 0.1)', border: 'rgba(255, 165, 0, 0.3)', text: '#ffa500' },
      'in_progress': { bg: 'rgba(0, 178, 255, 0.1)', border: 'rgba(0, 178, 255, 0.3)', text: '#00b2ff' },
      'delivered': { bg: 'rgba(157, 78, 221, 0.1)', border: 'rgba(157, 78, 221, 0.3)', text: '#9d4edd' },
      'revision_requested': { bg: 'rgba(255, 46, 187, 0.1)', border: 'rgba(255, 46, 187, 0.3)', text: '#ff2ebb' },
      'completed': { bg: 'rgba(74, 222, 128, 0.1)', border: 'rgba(74, 222, 128, 0.3)', text: '#4ade80' }
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
      <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(157, 78, 221, 0.2); border-radius: 12px; padding: 20px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <span style="font-size: 1.1rem; font-weight: 600; color: #fff;">#${order.order_number} - ${escapeHtml(order.character_name)}</span>
              ${order.is_rush ? '<span style="background: rgba(255, 68, 68, 0.2); color: #ff4444; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;">RUSH</span>' : ''}
              <span style="background: ${colors.bg}; border: 1px solid ${colors.border}; color: ${colors.text}; padding: 4px 12px; border-radius: 6px; font-size: 0.8rem;">${statusLabel}</span>
            </div>
            <div style="color: #888; font-size: 0.85rem; margin-bottom: 8px;">
              ${escapeHtml(order.user?.email || 'Unknown')} • Ordered: ${createdDate} • Est. Delivery: ${estimatedDate}
            </div>
            <div style="color: #666; font-size: 0.8rem;">
              Face: <a href="https://instagram.com/${extractUsername(order.face_instagram_1)}" target="_blank" style="color: #9d4edd;">@${extractUsername(order.face_instagram_1)}</a>,
              <a href="https://instagram.com/${extractUsername(order.face_instagram_2)}" target="_blank" style="color: #9d4edd;">@${extractUsername(order.face_instagram_2)}</a>
              • Body: <a href="https://instagram.com/${extractUsername(order.body_instagram)}" target="_blank" style="color: #9d4edd;">@${extractUsername(order.body_instagram)}</a>
              • Revisions: ${order.revisions_used || 0}/${order.revisions_purchased || 0}
              • Total: $${parseFloat(order.total_price).toFixed(2)}
            </div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button onclick="viewCustomOrderDetails('${order.id}')" style="padding: 8px 16px; background: rgba(157, 78, 221, 0.2); border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 8px; color: #9d4edd; cursor: pointer; font-size: 0.85rem;">
              View Details
            </button>
            ${order.status === 'pending' ? `
              <button onclick="updateCustomOrderStatus('${order.id}', 'in_progress')" style="padding: 8px 16px; background: rgba(0, 178, 255, 0.2); border: 1px solid rgba(0, 178, 255, 0.3); border-radius: 8px; color: #00b2ff; cursor: pointer; font-size: 0.85rem;">
                Start Job
              </button>
            ` : ''}
            ${order.status === 'in_progress' || order.status === 'revision_requested' ? `
              <button onclick="updateCustomOrderStatus('${order.id}', 'delivered')" style="padding: 8px 16px; background: rgba(74, 222, 128, 0.2); border: 1px solid rgba(74, 222, 128, 0.3); border-radius: 8px; color: #4ade80; cursor: pointer; font-size: 0.85rem;">
                Mark Delivered
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterCustomOrders() {
  renderCustomOrdersList();
}

function extractUsername(url) {
  if (!url) return '';
  // Extract username from Instagram URL or return as-is if just username
  const match = url.match(/instagram\.com\/([^\/\?]+)/i);
  if (match) return match[1];
  // If it starts with @, remove it
  if (url.startsWith('@')) return url.substring(1);
  // If it contains /, take the last part
  if (url.includes('/')) return url.split('/').filter(Boolean).pop();
  return url;
}

async function updateCustomOrderStatus(orderId, status) {
  try {
    const response = await authFetch(`${API_BASE_URL}/api/custom-characters/admin/orders/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });

    if (!response.ok) throw new Error('Failed to update order');

    await loadCustomOrders();
  } catch (error) {
    console.error('Error updating order:', error);
    alert('Failed to update order status');
  }
}

async function viewCustomOrderDetails(orderId) {
  try {
    const response = await authFetch(`${API_BASE_URL}/api/custom-characters/admin/orders/${orderId}`);
    if (!response.ok) throw new Error('Failed to load order');

    const data = await response.json();
    const order = data.order;

    showOrderDetailModal(order);
  } catch (error) {
    console.error('Error loading order details:', error);
    alert('Failed to load order details');
  }
}

function showOrderDetailModal(order) {
  const statusOptions = ['pending', 'in_progress', 'delivered', 'revision_requested', 'completed'];
  const createdDate = new Date(order.created_at).toLocaleString();
  const estimatedDate = order.estimated_delivery ? new Date(order.estimated_delivery).toLocaleDateString() : 'TBD';

  const modal = document.createElement('div');
  modal.id = 'customOrderDetailModal';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px;';

  modal.innerHTML = `
    <div style="background: #1a1a1a; border-radius: 16px; padding: 32px; max-width: 800px; width: 100%; max-height: 90vh; overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <h3 style="margin: 0; font-size: 1.3rem; color: #fff;">Order #${order.order_number} - ${escapeHtml(order.character_name)}</h3>
        <button onclick="closeOrderDetailModal()" style="background: none; border: none; color: #888; font-size: 1.5rem; cursor: pointer;">&times;</button>
      </div>

      <!-- Status -->
      <div style="margin-bottom: 24px;">
        <label style="display: block; color: #888; font-size: 0.85rem; margin-bottom: 6px;">Status</label>
        <select id="orderDetailStatus" style="padding: 10px 16px; background: #252525; border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem; cursor: pointer;">
          ${statusOptions.map(s => `<option value="${s}" ${order.status === s ? 'selected' : ''}>${s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>`).join('')}
        </select>
        <button onclick="saveOrderStatus('${order.id}')" style="margin-left: 12px; padding: 10px 20px; background: linear-gradient(135deg, #9d4edd, #ff2ebb); border: none; border-radius: 8px; color: #fff; cursor: pointer; font-size: 0.9rem;">
          Update Status
        </button>
      </div>

      <!-- Customer Info -->
      <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 12px; font-size: 0.95rem; color: #9d4edd;">Customer Information</h4>
        <div style="color: #fff; font-size: 0.9rem;">
          <div><strong>Email:</strong> ${escapeHtml(order.user?.email || 'Unknown')}</div>
          <div><strong>Ordered:</strong> ${createdDate}</div>
          <div><strong>Est. Delivery:</strong> ${estimatedDate}</div>
          <div><strong>Rush Order:</strong> ${order.is_rush ? 'Yes (+$' + order.rush_fee + ')' : 'No'}</div>
        </div>
      </div>

      <!-- Pricing -->
      <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 12px; font-size: 0.95rem; color: #4ade80;">Pricing</h4>
        <div style="color: #fff; font-size: 0.9rem;">
          <div>Base Price: $${parseFloat(order.base_price).toFixed(2)}</div>
          <div>Revisions (${order.revisions_purchased}): $${(order.revisions_purchased * parseFloat(order.revision_price)).toFixed(2)}</div>
          ${order.is_rush ? `<div>Rush Fee: $${parseFloat(order.rush_fee).toFixed(2)}</div>` : ''}
          <div style="font-weight: 600; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">Total: $${parseFloat(order.total_price).toFixed(2)}</div>
        </div>
      </div>

      <!-- Face Inspiration -->
      <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 12px; font-size: 0.95rem; color: #ff2ebb;">Face Inspiration</h4>
        <div style="display: grid; gap: 12px;">
          <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px;">
            <a href="https://instagram.com/${extractUsername(order.face_instagram_1)}" target="_blank" style="color: #9d4edd; font-size: 0.9rem;">instagram.com/${extractUsername(order.face_instagram_1)}</a>
            ${order.face_instagram_1_notes ? `<div style="color: #888; font-size: 0.85rem; margin-top: 6px;">"${escapeHtml(order.face_instagram_1_notes)}"</div>` : ''}
          </div>
          <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px;">
            <a href="https://instagram.com/${extractUsername(order.face_instagram_2)}" target="_blank" style="color: #9d4edd; font-size: 0.9rem;">instagram.com/${extractUsername(order.face_instagram_2)}</a>
            ${order.face_instagram_2_notes ? `<div style="color: #888; font-size: 0.85rem; margin-top: 6px;">"${escapeHtml(order.face_instagram_2_notes)}"</div>` : ''}
          </div>
        </div>
      </div>

      <!-- Body Inspiration -->
      <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 12px; font-size: 0.95rem; color: #00b2ff;">Body Inspiration</h4>
        <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px;">
          <a href="https://instagram.com/${extractUsername(order.body_instagram)}" target="_blank" style="color: #9d4edd; font-size: 0.9rem;">instagram.com/${extractUsername(order.body_instagram)}</a>
          ${order.body_instagram_notes ? `<div style="color: #888; font-size: 0.85rem; margin-top: 6px;">"${escapeHtml(order.body_instagram_notes)}"</div>` : ''}
        </div>
      </div>

      <!-- Additional References -->
      ${order.google_drive_link || (order.uploaded_images && order.uploaded_images.length > 0) ? `
        <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 12px; font-size: 0.95rem; color: #ffa500;">Additional References</h4>
          ${order.google_drive_link ? `<div style="margin-bottom: 8px;"><a href="${escapeHtml(order.google_drive_link)}" target="_blank" style="color: #9d4edd;">Google Drive Link</a></div>` : ''}
          ${order.uploaded_images && order.uploaded_images.length > 0 ? `<div style="color: #888; font-size: 0.9rem;">${order.uploaded_images.length} uploaded images</div>` : ''}
        </div>
      ` : ''}

      <!-- Revisions -->
      ${order.revisions && order.revisions.length > 0 ? `
        <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 12px; font-size: 0.95rem; color: #ff2ebb;">Revision History</h4>
          ${order.revisions.map(rev => `
            <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="color: #fff; font-weight: 500;">Revision ${rev.revision_number}</span>
                <span style="color: ${rev.status === 'completed' ? '#4ade80' : '#ffa500'}; font-size: 0.8rem;">${rev.status}</span>
              </div>
              <div style="color: #888; font-size: 0.85rem;">${escapeHtml(rev.feedback)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Admin Notes -->
      <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 12px; font-size: 0.95rem; color: #888;">Admin Notes</h4>
        <textarea id="orderDetailNotes" rows="4" placeholder="Internal notes (not visible to customer)..." style="width: 100%; padding: 12px; background: #252525; border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem; resize: vertical;">${escapeHtml(order.admin_notes || '')}</textarea>
        <button onclick="saveOrderNotes('${order.id}')" style="margin-top: 12px; padding: 10px 20px; background: rgba(157, 78, 221, 0.2); border: 1px solid rgba(157, 78, 221, 0.3); border-radius: 8px; color: #9d4edd; cursor: pointer; font-size: 0.9rem;">
          Save Notes
        </button>
      </div>

      <!-- Final Character Assignment -->
      <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 16px;">
        <h4 style="margin: 0 0 12px; font-size: 0.95rem; color: #4ade80;">Assign Final Character</h4>
        <div style="display: flex; gap: 12px; align-items: center;">
          <input type="text" id="orderDetailFinalCharId" placeholder="Character ID (UUID)" value="${order.final_character_id || ''}" style="flex: 1; padding: 10px 16px; background: #252525; border: 1px solid rgba(74, 222, 128, 0.3); border-radius: 8px; color: #fff; font-size: 0.9rem;">
          <button onclick="assignFinalCharacter('${order.id}')" style="padding: 10px 20px; background: linear-gradient(135deg, #4ade80, #22c55e); border: none; border-radius: 8px; color: #fff; cursor: pointer; font-size: 0.9rem;">
            Assign & Complete
          </button>
        </div>
        ${order.final_character?.name ? `<div style="color: #4ade80; font-size: 0.85rem; margin-top: 8px;">Currently assigned: ${escapeHtml(order.final_character.name)}</div>` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeOrderDetailModal();
  });
}

function closeOrderDetailModal() {
  const modal = document.getElementById('customOrderDetailModal');
  if (modal) modal.remove();
}

async function saveOrderStatus(orderId) {
  const status = document.getElementById('orderDetailStatus').value;

  try {
    const response = await authFetch(`${API_BASE_URL}/api/custom-characters/admin/orders/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });

    if (!response.ok) throw new Error('Failed to update status');

    alert('Status updated successfully');
    closeOrderDetailModal();
    await loadCustomOrders();
  } catch (error) {
    console.error('Error updating status:', error);
    alert('Failed to update status');
  }
}

async function saveOrderNotes(orderId) {
  const notes = document.getElementById('orderDetailNotes').value;

  try {
    const response = await authFetch(`${API_BASE_URL}/api/custom-characters/admin/orders/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify({ admin_notes: notes })
    });

    if (!response.ok) throw new Error('Failed to save notes');

    alert('Notes saved successfully');
  } catch (error) {
    console.error('Error saving notes:', error);
    alert('Failed to save notes');
  }
}

async function assignFinalCharacter(orderId) {
  const charId = document.getElementById('orderDetailFinalCharId').value.trim();

  if (!charId) {
    alert('Please enter a character ID');
    return;
  }

  try {
    const response = await authFetch(`${API_BASE_URL}/api/custom-characters/admin/orders/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify({
        final_character_id: charId,
        status: 'completed'
      })
    });

    if (!response.ok) throw new Error('Failed to assign character');

    alert('Character assigned and order completed!');
    closeOrderDetailModal();
    await loadCustomOrders();
  } catch (error) {
    console.error('Error assigning character:', error);
    alert('Failed to assign character. Make sure the ID is valid.');
  }
}

// ===========================================
// PRICING TAB
// ===========================================

async function loadCustomConfig() {
  try {
    const response = await authFetch(`${API_BASE_URL}/api/custom-characters/admin/config`);
    if (!response.ok) throw new Error('Failed to load config');

    const data = await response.json();
    customConfig = data.config;

    populateConfigForm();
  } catch (error) {
    console.error('Error loading custom config:', error);
  }
}

function populateConfigForm() {
  if (!customConfig) return;

  document.getElementById('customConfigBasePrice').value = customConfig.base_price || 795;
  document.getElementById('customConfigRevisionPrice').value = customConfig.revision_price || 100;
  document.getElementById('customConfigRushFee').value = customConfig.rush_fee || 200;
  document.getElementById('customConfigMaxRevisions').value = customConfig.max_revisions || 3;
  document.getElementById('customConfigStandardMin').value = customConfig.standard_days_min || 3;
  document.getElementById('customConfigStandardMax').value = customConfig.standard_days_max || 5;
  document.getElementById('customConfigRushDays').value = customConfig.rush_days || 2;
  document.getElementById('customConfigMaxImages').value = customConfig.max_upload_images || 10;
  document.getElementById('customConfigMaxSize').value = customConfig.max_image_size_mb || 5;
  document.getElementById('customConfigIsActive').checked = customConfig.is_active !== false;
  document.getElementById('customConfigRequirements').value = customConfig.requirements_text || '';
}

async function saveCustomConfig() {
  const configData = {
    base_price: parseFloat(document.getElementById('customConfigBasePrice').value) || 795,
    revision_price: parseFloat(document.getElementById('customConfigRevisionPrice').value) || 100,
    rush_fee: parseFloat(document.getElementById('customConfigRushFee').value) || 200,
    max_revisions: parseInt(document.getElementById('customConfigMaxRevisions').value) || 3,
    standard_days_min: parseInt(document.getElementById('customConfigStandardMin').value) || 3,
    standard_days_max: parseInt(document.getElementById('customConfigStandardMax').value) || 5,
    rush_days: parseInt(document.getElementById('customConfigRushDays').value) || 2,
    max_upload_images: parseInt(document.getElementById('customConfigMaxImages').value) || 10,
    max_image_size_mb: parseInt(document.getElementById('customConfigMaxSize').value) || 5,
    is_active: document.getElementById('customConfigIsActive').checked,
    requirements_text: document.getElementById('customConfigRequirements').value
  };

  try {
    const response = await authFetch(`${API_BASE_URL}/api/custom-characters/admin/config`, {
      method: 'PUT',
      body: JSON.stringify(configData)
    });

    if (!response.ok) throw new Error('Failed to save config');

    customConfig = (await response.json()).config;
    alert('Configuration saved successfully!');
  } catch (error) {
    console.error('Error saving config:', error);
    alert('Failed to save configuration');
  }
}
