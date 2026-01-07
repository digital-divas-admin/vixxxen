// ===========================================
// BILLING PAGE FUNCTIONS
// ===========================================
// Depends on: config.js (currentUser, supabaseClient)

// Open billing page
function openBillingPage() {
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

  // Show billing page
  document.getElementById('billingSection').classList.add('active');

  // Load billing data
  loadBillingData();

  console.log('Opened billing page');
}

// Load billing data
async function loadBillingData() {
  if (!currentUser) return;

  // Set credits balance
  const creditsDisplay = document.getElementById('billingCredits');
  if (creditsDisplay) {
    creditsDisplay.textContent = currentUser.credits?.toLocaleString() || '0';
  }

  // Load transaction history
  await loadTransactions();
}

// Load transaction history from Supabase
async function loadTransactions() {
  const tableBody = document.getElementById('transactionTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '<tr class="transaction-loading"><td colspan="4">Loading transactions...</td></tr>';

  if (!currentUser) {
    tableBody.innerHTML = '<tr><td colspan="4" class="no-transactions">Please log in to view transactions</td></tr>';
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
      tableBody.innerHTML = '<tr><td colspan="4" class="no-transactions">No transactions yet</td></tr>';
      return;
    }

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
          <td>${tx.description || '-'}</td>
        </tr>
      `;
    }).join('');

    console.log(`Loaded ${transactions.length} transactions`);
  } catch (error) {
    console.error('Error loading transactions:', error);
    tableBody.innerHTML = '<tr><td colspan="4" class="no-transactions">Failed to load transactions</td></tr>';
  }
}

// Go back from billing page
function goBackFromBilling() {
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
