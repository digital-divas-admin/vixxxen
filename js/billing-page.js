// ===========================================
// BILLING PAGE FUNCTIONS
// ===========================================
// Depends on: config.js (currentUser, supabaseClient)

// Credit costs per feature (for billing page calculations)
// Note: Main CREDIT_COSTS is in index.html, this is just for reference
const BILLING_COSTS = {
  standard: 13,  // nano-banana
  flux: 20,      // HD image
  quick: 6       // seedream
};

// For backwards compatibility
const STANDARD_GENERATION_COST = BILLING_COSTS.standard;

// Open billing page
function openBillingPage() {
  // Close user menu
  document.getElementById('userMenu').classList.remove('active');

  // Handle mobile view
  if (window.innerWidth <= 900) {
    const dashboard = document.getElementById('mobileDashboard');
    const container = document.querySelector('.container');
    const backBar = document.getElementById('mobileBackBar');
    const currentToolLabel = document.getElementById('mobileCurrentTool');
    const siteFooter = document.querySelector('.site-footer');

    // Hide dashboard, show container
    if (dashboard) dashboard.classList.add('hidden');
    if (container) container.classList.add('mobile-tool-active');
    if (backBar) backBar.classList.add('visible');
    if (currentToolLabel) currentToolLabel.textContent = 'Billing';
    if (siteFooter) siteFooter.style.display = 'none';

    // Set mobile tool state
    window.mobileToolActive = 'billing';
  }

  // Hide all tab sections
  document.querySelectorAll('.tab-section').forEach(section => {
    section.classList.remove('active');
  });

  // Deactivate all nav tabs
  document.querySelectorAll('.nav-tab').forEach(navTab => {
    navTab.classList.remove('active');
  });

  // Show billing page
  document.getElementById('billingSection').classList.add('active');

  // Load billing data
  loadBillingData();

  console.log('Opened billing page');
}

// Animate credit balance counter
function animateCreditsCounter(targetValue, element) {
  const duration = 800;
  const startValue = 0;
  const startTime = performance.now();

  element.classList.add('animating');

  function updateCounter(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out cubic
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.floor(startValue + (targetValue - startValue) * easeOut);

    element.textContent = currentValue.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(updateCounter);
    } else {
      element.textContent = targetValue.toLocaleString();
      element.classList.remove('animating');
    }
  }

  requestAnimationFrame(updateCounter);
}

// Load billing data
async function loadBillingData() {
  if (!currentUser) return;

  const credits = typeof userCredits === 'number' ? userCredits : 0;

  // Set credits balance with animation
  const creditsDisplay = document.getElementById('billingCredits');
  if (creditsDisplay) {
    animateCreditsCounter(credits, creditsDisplay);
  }

  // Update context text (number of generations)
  const generationsEl = document.getElementById('billingGenerations');
  if (generationsEl) {
    const generations = Math.floor(credits / STANDARD_GENERATION_COST);
    generationsEl.textContent = generations.toLocaleString();
  }

  // Show/hide low balance warning
  const lowBalanceEl = document.getElementById('billingLowBalance');
  if (lowBalanceEl) {
    if (credits < 50) {
      lowBalanceEl.classList.add('visible');
    } else {
      lowBalanceEl.classList.remove('visible');
    }
  }

  // Update "What can you create?" counts
  const standardCountEl = document.getElementById('refStandardCount');
  const fluxCountEl = document.getElementById('refFluxCount');
  const quickCountEl = document.getElementById('refQuickCount');

  if (standardCountEl) {
    const count = Math.floor(credits / BILLING_COSTS.standard);
    standardCountEl.textContent = `~${count.toLocaleString()} remaining`;
  }
  if (fluxCountEl) {
    const count = Math.floor(credits / BILLING_COSTS.flux);
    fluxCountEl.textContent = `~${count.toLocaleString()} remaining`;
  }
  if (quickCountEl) {
    const count = Math.floor(credits / BILLING_COSTS.quick);
    quickCountEl.textContent = `~${count.toLocaleString()} remaining`;
  }

  // Load transaction history
  await loadTransactions();
}

// Load transaction history from Supabase
async function loadTransactions() {
  const tableBody = document.getElementById('transactionTableBody');
  const cardsContainer = document.getElementById('transactionCardsView');

  if (!tableBody) return;

  tableBody.innerHTML = '<tr class="transaction-loading"><td colspan="4">Loading transactions...</td></tr>';
  if (cardsContainer) cardsContainer.innerHTML = '<div class="transaction-card"><div class="transaction-card-left"><div class="transaction-card-desc">Loading...</div></div></div>';

  if (!currentUser) {
    const noLoginMsg = '<tr><td colspan="4" class="no-transactions">Please log in to view transactions</td></tr>';
    tableBody.innerHTML = noLoginMsg;
    if (cardsContainer) cardsContainer.innerHTML = '<div class="no-transactions">Please log in to view transactions</div>';
    return;
  }

  try {
    const { data: transactions, error } = await supabaseClient
      .from('transactions')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    if (!transactions || transactions.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="4" class="no-transactions"><div class="no-transactions-icon">📜</div>No transactions yet</td></tr>';
      if (cardsContainer) cardsContainer.innerHTML = '<div class="no-transactions"><div class="no-transactions-icon">📜</div>No transactions yet</div>';
      return;
    }

    // Render table view
    tableBody.innerHTML = transactions.map(tx => {
      const date = new Date(tx.created_at);
      const dateStr = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const isPositive = tx.amount > 0;
      const amountClass = isPositive ? 'positive' : 'negative';
      const amountStr = isPositive ? `+${tx.amount}` : tx.amount.toString();

      const typeClass = tx.type;
      const typeDisplay = tx.type.charAt(0).toUpperCase() + tx.type.slice(1);

      return `
        <tr>
          <td>${dateStr}</td>
          <td><span class="transaction-type ${typeClass}">${typeDisplay}</span></td>
          <td><span class="transaction-amount ${amountClass}">${amountStr}</span></td>
          <td class="transaction-description">${escapeHtml(tx.description || '-')}</td>
        </tr>
      `;
    }).join('');

    // Render card view (for mobile)
    if (cardsContainer) {
      cardsContainer.innerHTML = transactions.map(tx => {
        const date = new Date(tx.created_at);
        const dateStr = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        });
        const timeStr = date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });

        const isPositive = tx.amount > 0;
        const amountClass = isPositive ? 'positive' : 'negative';
        const amountStr = isPositive ? `+${tx.amount}` : tx.amount.toString();

        const typeClass = tx.type;
        const typeDisplay = tx.type.charAt(0).toUpperCase() + tx.type.slice(1);

        return `
          <div class="transaction-card">
            <div class="transaction-card-left">
              <div class="transaction-card-amount ${amountClass}">${amountStr} credits</div>
              <div class="transaction-card-desc">${escapeHtml(tx.description || '-')}</div>
            </div>
            <div class="transaction-card-right">
              <div class="transaction-card-date">${dateStr}, ${timeStr}</div>
              <span class="transaction-type ${typeClass}">${typeDisplay}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    console.log(`Loaded ${transactions.length} transactions`);
  } catch (error) {
    console.error('Error loading transactions:', error);
    tableBody.innerHTML = '<tr><td colspan="4" class="no-transactions">Failed to load transactions</td></tr>';
    if (cardsContainer) cardsContainer.innerHTML = '<div class="no-transactions">Failed to load transactions</div>';
  }
}

// Toggle between table and card view
function setTransactionView(view) {
  const tableView = document.getElementById('transactionTableView');
  const cardsView = document.getElementById('transactionCardsView');
  const buttons = document.querySelectorAll('.transaction-view-btn');

  buttons.forEach(btn => btn.classList.remove('active'));

  if (view === 'table') {
    if (tableView) tableView.style.display = 'block';
    if (cardsView) cardsView.style.display = 'none';
    buttons[0]?.classList.add('active');
  } else {
    if (tableView) tableView.style.display = 'none';
    if (cardsView) cardsView.style.display = 'flex';
    buttons[1]?.classList.add('active');
  }
}

// Helper: escape HTML to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Go back from billing page
function goBackFromBilling() {
  // On mobile, use backToDashboard() to properly handle mobile UI state
  if (window.innerWidth <= 900) {
    // Hide billing section first
    document.getElementById('billingSection').classList.remove('active');

    // Show image section (default) so it's ready when user returns
    document.getElementById('imageSection').classList.add('active');

    // Activate image nav tab
    document.querySelectorAll('.nav-tab').forEach(navTab => {
      navTab.classList.remove('active');
    });
    document.querySelector('.nav-tab[onclick*="imageSection"]')?.classList.add('active');

    // Call backToDashboard to handle mobile state (shows dashboard, hides back bar, etc.)
    if (typeof backToDashboard === 'function') {
      backToDashboard();
    }
    return;
  }

  // Desktop behavior - just switch tabs
  // Hide billing section
  document.getElementById('billingSection').classList.remove('active');

  // Show image section (default)
  document.getElementById('imageSection').classList.add('active');

  // Activate image nav tab
  document.querySelectorAll('.nav-tab').forEach(navTab => {
    navTab.classList.remove('active');
  });
  document.querySelector('.nav-tab[onclick*="imageSection"]')?.classList.add('active');
}
