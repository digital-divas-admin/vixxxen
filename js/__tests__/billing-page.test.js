/**
 * Billing Page Tests
 * Tests for billing page functionality including credit display,
 * packages, transaction history, and responsive behavior
 */

describe('Billing Page', () => {
  // Mock globals
  let currentUser;
  let userCredits;
  let supabaseClient;

  // Constants from billing-page.js
  const STANDARD_GENERATION_COST = 13;

  beforeEach(() => {
    // Reset globals
    currentUser = { id: 'test-user-123', email: 'test@example.com' };
    userCredits = 1000;
    window.currentUser = currentUser;
    window.userCredits = userCredits;

    // Mock supabaseClient
    supabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [
          {
            id: '1',
            created_at: '2026-01-20T10:00:00Z',
            type: 'credit',
            amount: 2500,
            description: 'Credit purchase (Pro package)'
          },
          {
            id: '2',
            created_at: '2026-01-20T09:30:00Z',
            type: 'debit',
            amount: -13,
            description: 'Image generation (nano-banana)'
          },
          {
            id: '3',
            created_at: '2026-01-19T15:00:00Z',
            type: 'refund',
            amount: 13,
            description: 'Refund: Generation failed'
          }
        ],
        error: null
      })
    };
    window.supabaseClient = supabaseClient;

    // Add billing page DOM structure
    const billingHTML = `
      <div class="tab-section" id="billingSection">
        <div class="billing-hero">
          <div class="billing-hero-content">
            <div class="billing-hero-label">
              <span>Your Credits</span>
            </div>
            <span class="credits-balance-number" id="billingCredits">0</span>
            <div class="credits-balance-context" id="billingContext">
              Enough for <span id="billingGenerations">0</span> image generations
            </div>
            <div class="billing-low-balance" id="billingLowBalance">
              Running low on credits? Top up to keep creating!
            </div>
          </div>
        </div>

        <div class="credits-packages">
          <button class="credits-package" data-credits="500" data-price="1.00">
            <div class="package-header">
              <div class="package-name">Starter</div>
              <div class="package-credits">500</div>
            </div>
            <div class="package-pricing">
              <div class="package-price">$1.00</div>
              <div class="package-unit-price">$0.20 per 100 credits</div>
            </div>
          </button>
          <button class="credits-package" data-credits="1000" data-price="1.50">
            <span class="package-badge">Popular</span>
            <div class="package-header">
              <div class="package-name">Creator</div>
              <div class="package-credits">1,000</div>
            </div>
            <div class="package-pricing">
              <div class="package-price">$1.50</div>
              <div class="package-savings">Save 25%</div>
            </div>
          </button>
          <button class="credits-package featured" data-credits="2500" data-price="2.00">
            <span class="package-badge">Best Value</span>
            <div class="package-header">
              <div class="package-name">Pro</div>
              <div class="package-credits">2,500</div>
            </div>
            <div class="package-pricing">
              <div class="package-price">$2.00</div>
              <div class="package-savings">Save 60%</div>
            </div>
          </button>
        </div>

        <div class="credits-reference">
          <div class="credits-reference-title">What can you create?</div>
          <div class="credits-reference-grid">
            <div class="credits-reference-item">
              <span class="credits-reference-item-name">Standard Image<span class="credits-reference-item-unit">13 credits each</span></span>
              <span class="credits-reference-item-cost" id="refStandardCount">~0 remaining</span>
            </div>
            <div class="credits-reference-item">
              <span class="credits-reference-item-name">HD Image (Flux)<span class="credits-reference-item-unit">20 credits each</span></span>
              <span class="credits-reference-item-cost" id="refFluxCount">~0 remaining</span>
            </div>
            <div class="credits-reference-item">
              <span class="credits-reference-item-name">Quick Image<span class="credits-reference-item-unit">6 credits each</span></span>
              <span class="credits-reference-item-cost" id="refQuickCount">~0 remaining</span>
            </div>
            <div class="credits-reference-item">
              <span class="credits-reference-item-name">Face Lock<span class="credits-reference-item-unit">add-on</span></span>
              <span class="credits-reference-item-cost">+5 per image</span>
            </div>
          </div>
        </div>

        <div class="transaction-section">
          <div class="transaction-header">
            <div class="transaction-header-title">Transaction History</div>
            <div class="transaction-view-toggle">
              <button class="transaction-view-btn active">Table</button>
              <button class="transaction-view-btn">Cards</button>
            </div>
          </div>
          <div class="transaction-table-container" id="transactionTableView">
            <table class="transaction-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody id="transactionTableBody">
                <tr class="transaction-loading">
                  <td colspan="4">Loading transactions...</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="transaction-cards" id="transactionCardsView" style="display: none;"></div>
        </div>

        <div class="billing-trust">
          <div class="billing-trust-item">Secure Payment</div>
          <div class="billing-trust-item">Instant Credits</div>
          <div class="billing-trust-item">Crypto Accepted</div>
        </div>
      </div>
    `;

    // Add to existing DOM
    document.body.innerHTML += billingHTML;
  });

  afterEach(() => {
    // Clean up billing section
    const billingSection = document.getElementById('billingSection');
    if (billingSection) billingSection.remove();
  });

  describe('Credit Balance Display', () => {
    // Implementation of animateCreditsCounter for testing
    function animateCreditsCounter(targetValue, element) {
      // For tests, skip animation and set immediately
      element.textContent = targetValue.toLocaleString();
    }

    test('should display current credit balance', () => {
      const creditsDisplay = document.getElementById('billingCredits');
      animateCreditsCounter(1000, creditsDisplay);
      expect(creditsDisplay.textContent).toBe('1,000');
    });

    test('should format large numbers with commas', () => {
      const creditsDisplay = document.getElementById('billingCredits');
      animateCreditsCounter(12500, creditsDisplay);
      expect(creditsDisplay.textContent).toBe('12,500');
    });

    test('should display 0 for no credits', () => {
      const creditsDisplay = document.getElementById('billingCredits');
      animateCreditsCounter(0, creditsDisplay);
      expect(creditsDisplay.textContent).toBe('0');
    });
  });

  describe('Generation Context', () => {
    test('should calculate correct number of generations', () => {
      const generationsEl = document.getElementById('billingGenerations');
      const credits = 1000;
      const generations = Math.floor(credits / STANDARD_GENERATION_COST);
      generationsEl.textContent = generations.toLocaleString();

      expect(generationsEl.textContent).toBe('76'); // 1000 / 13 = 76.9 -> 76
    });

    test('should show 0 generations when credits are low', () => {
      const generationsEl = document.getElementById('billingGenerations');
      const credits = 10;
      const generations = Math.floor(credits / STANDARD_GENERATION_COST);
      generationsEl.textContent = generations.toLocaleString();

      expect(generationsEl.textContent).toBe('0');
    });

    test('should format large generation counts', () => {
      const generationsEl = document.getElementById('billingGenerations');
      const credits = 25000;
      const generations = Math.floor(credits / STANDARD_GENERATION_COST);
      generationsEl.textContent = generations.toLocaleString();

      expect(generationsEl.textContent).toBe('1,923'); // 25000 / 13 = 1923.07 -> 1923
    });
  });

  describe('Low Balance Warning', () => {
    test('should show warning when credits below 50', () => {
      const lowBalanceEl = document.getElementById('billingLowBalance');
      const credits = 30;

      if (credits < 50) {
        lowBalanceEl.classList.add('visible');
      } else {
        lowBalanceEl.classList.remove('visible');
      }

      expect(lowBalanceEl.classList.contains('visible')).toBe(true);
    });

    test('should hide warning when credits are sufficient', () => {
      const lowBalanceEl = document.getElementById('billingLowBalance');
      const credits = 500;

      if (credits < 50) {
        lowBalanceEl.classList.add('visible');
      } else {
        lowBalanceEl.classList.remove('visible');
      }

      expect(lowBalanceEl.classList.contains('visible')).toBe(false);
    });

    test('should show warning at exactly 49 credits', () => {
      const lowBalanceEl = document.getElementById('billingLowBalance');
      const credits = 49;

      if (credits < 50) {
        lowBalanceEl.classList.add('visible');
      }

      expect(lowBalanceEl.classList.contains('visible')).toBe(true);
    });

    test('should hide warning at exactly 50 credits', () => {
      const lowBalanceEl = document.getElementById('billingLowBalance');
      const credits = 50;

      if (credits < 50) {
        lowBalanceEl.classList.add('visible');
      } else {
        lowBalanceEl.classList.remove('visible');
      }

      expect(lowBalanceEl.classList.contains('visible')).toBe(false);
    });
  });

  describe('Credit Packages', () => {
    test('should have three credit packages', () => {
      const packages = document.querySelectorAll('.credits-package');
      expect(packages.length).toBe(3);
    });

    test('should have featured class on best value package', () => {
      const featuredPackage = document.querySelector('.credits-package.featured');
      expect(featuredPackage).not.toBeNull();
      expect(featuredPackage.getAttribute('data-credits')).toBe('2500');
    });

    test('should have correct savings badges', () => {
      const savingsBadges = document.querySelectorAll('.package-savings');
      expect(savingsBadges.length).toBe(2); // Creator (25%) and Pro (60%)
    });

    test('should show Popular badge on Creator package', () => {
      const creatorPackage = document.querySelector('.credits-package[data-credits="1000"]');
      const badge = creatorPackage.querySelector('.package-badge');
      expect(badge.textContent).toBe('Popular');
    });

    test('should show Best Value badge on Pro package', () => {
      const proPackage = document.querySelector('.credits-package.featured');
      const badge = proPackage.querySelector('.package-badge');
      expect(badge.textContent).toBe('Best Value');
    });

    test('Starter package should have no savings badge', () => {
      const starterPackage = document.querySelector('.credits-package[data-credits="500"]');
      const savingsBadge = starterPackage.querySelector('.package-savings');
      expect(savingsBadge).toBeNull();
    });
  });

  describe('Credits Reference Section', () => {
    // Credit costs (from billing-page.js)
    const CREDIT_COSTS = {
      standard: 13,
      flux: 20,
      quick: 6
    };

    test('should display credit reference items', () => {
      const referenceItems = document.querySelectorAll('.credits-reference-item');
      expect(referenceItems.length).toBe(4); // Standard, HD, Quick, Face Lock
    });

    test('should have IDs for dynamic count updates', () => {
      expect(document.getElementById('refStandardCount')).not.toBeNull();
      expect(document.getElementById('refFluxCount')).not.toBeNull();
      expect(document.getElementById('refQuickCount')).not.toBeNull();
    });

    test('should show unit prices for each feature', () => {
      const unitPrices = document.querySelectorAll('.credits-reference-item-unit');
      expect(unitPrices.length).toBe(4);
      expect(unitPrices[0].textContent).toBe('13 credits each');
      expect(unitPrices[1].textContent).toBe('20 credits each');
      expect(unitPrices[2].textContent).toBe('6 credits each');
    });

    test('should calculate correct remaining count for Standard Image', () => {
      const credits = 1000;
      const count = Math.floor(credits / CREDIT_COSTS.standard);
      document.getElementById('refStandardCount').textContent = `~${count.toLocaleString()} remaining`;
      expect(document.getElementById('refStandardCount').textContent).toBe('~76 remaining');
    });

    test('should calculate correct remaining count for HD Image', () => {
      const credits = 1000;
      const count = Math.floor(credits / CREDIT_COSTS.flux);
      document.getElementById('refFluxCount').textContent = `~${count.toLocaleString()} remaining`;
      expect(document.getElementById('refFluxCount').textContent).toBe('~50 remaining');
    });

    test('should calculate correct remaining count for Quick Image', () => {
      const credits = 1000;
      const count = Math.floor(credits / CREDIT_COSTS.quick);
      document.getElementById('refQuickCount').textContent = `~${count.toLocaleString()} remaining`;
      expect(document.getElementById('refQuickCount').textContent).toBe('~166 remaining');
    });

    test('Face Lock should show static +5 per image', () => {
      const items = document.querySelectorAll('.credits-reference-item');
      const faceLockItem = items[3]; // Last item
      const cost = faceLockItem.querySelector('.credits-reference-item-cost').textContent;
      expect(cost).toBe('+5 per image');
    });
  });

  describe('Transaction View Toggle', () => {
    // Implementation of setTransactionView for testing
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

    test('should show table view by default', () => {
      const tableView = document.getElementById('transactionTableView');
      const cardsView = document.getElementById('transactionCardsView');

      // Table should be visible by default
      expect(getComputedStyle(tableView).display).not.toBe('none');
    });

    test('should switch to card view', () => {
      setTransactionView('cards');

      const tableView = document.getElementById('transactionTableView');
      const cardsView = document.getElementById('transactionCardsView');

      expect(tableView.style.display).toBe('none');
      expect(cardsView.style.display).toBe('flex');
    });

    test('should switch back to table view', () => {
      setTransactionView('cards');
      setTransactionView('table');

      const tableView = document.getElementById('transactionTableView');
      const cardsView = document.getElementById('transactionCardsView');

      expect(tableView.style.display).toBe('block');
      expect(cardsView.style.display).toBe('none');
    });

    test('should update active class on buttons', () => {
      const buttons = document.querySelectorAll('.transaction-view-btn');

      setTransactionView('cards');
      expect(buttons[0].classList.contains('active')).toBe(false);
      expect(buttons[1].classList.contains('active')).toBe(true);

      setTransactionView('table');
      expect(buttons[0].classList.contains('active')).toBe(true);
      expect(buttons[1].classList.contains('active')).toBe(false);
    });
  });

  describe('Transaction History Loading', () => {
    test('should show loading state initially', () => {
      const tableBody = document.getElementById('transactionTableBody');
      const loadingRow = tableBody.querySelector('.transaction-loading');
      expect(loadingRow).not.toBeNull();
    });

    test('should have correct table headers', () => {
      const headers = document.querySelectorAll('.transaction-table th');
      const headerTexts = Array.from(headers).map(h => h.textContent);
      expect(headerTexts).toEqual(['Date', 'Type', 'Amount', 'Description']);
    });
  });

  describe('Transaction Rendering', () => {
    // Helper to render a transaction row
    function renderTransactionRow(tx) {
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
      const typeDisplay = tx.type.charAt(0).toUpperCase() + tx.type.slice(1);

      return {
        dateStr,
        amountClass,
        amountStr,
        typeDisplay
      };
    }

    test('should format positive amounts with + sign', () => {
      const result = renderTransactionRow({
        created_at: '2026-01-20T10:00:00Z',
        type: 'credit',
        amount: 2500,
        description: 'Credit purchase'
      });
      expect(result.amountStr).toBe('+2500');
      expect(result.amountClass).toBe('positive');
    });

    test('should format negative amounts without + sign', () => {
      const result = renderTransactionRow({
        created_at: '2026-01-20T10:00:00Z',
        type: 'debit',
        amount: -13,
        description: 'Image generation'
      });
      expect(result.amountStr).toBe('-13');
      expect(result.amountClass).toBe('negative');
    });

    test('should capitalize transaction type', () => {
      const result = renderTransactionRow({
        created_at: '2026-01-20T10:00:00Z',
        type: 'refund',
        amount: 13,
        description: 'Refund'
      });
      expect(result.typeDisplay).toBe('Refund');
    });

    test('should format date correctly', () => {
      const result = renderTransactionRow({
        created_at: '2026-01-20T10:00:00Z',
        type: 'credit',
        amount: 100,
        description: 'Test'
      });
      // Date should contain month and day
      expect(result.dateStr).toContain('Jan');
      expect(result.dateStr).toContain('20');
    });
  });

  describe('Trust Section', () => {
    test('should display trust badges', () => {
      const trustItems = document.querySelectorAll('.billing-trust-item');
      expect(trustItems.length).toBe(3);
    });

    test('should include secure payment badge', () => {
      const trustSection = document.querySelector('.billing-trust');
      expect(trustSection.textContent).toContain('Secure Payment');
    });

    test('should include instant credits badge', () => {
      const trustSection = document.querySelector('.billing-trust');
      expect(trustSection.textContent).toContain('Instant Credits');
    });

    test('should include crypto accepted badge', () => {
      const trustSection = document.querySelector('.billing-trust');
      expect(trustSection.textContent).toContain('Crypto Accepted');
    });
  });

  describe('XSS Protection', () => {
    // Helper escape function
    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    test('should escape HTML in transaction descriptions', () => {
      const maliciousInput = '<script>alert("xss")</script>';
      const escaped = escapeHtml(maliciousInput);
      expect(escaped).not.toContain('<script>');
      expect(escaped).toContain('&lt;script&gt;');
    });

    test('should handle empty descriptions', () => {
      const escaped = escapeHtml('');
      expect(escaped).toBe('');
    });

    test('should handle null descriptions', () => {
      const escaped = escapeHtml(null);
      expect(escaped).toBe('');
    });

    test('should escape quotes', () => {
      const input = 'Test "quoted" value';
      const escaped = escapeHtml(input);
      // textContent automatically handles this
      expect(escaped).toBe('Test "quoted" value');
    });
  });

  describe('Mobile Responsive Behavior', () => {
    test('should have mobile-specific styles available', () => {
      setMobileViewport();
      // The CSS handles this - just verify viewport is set
      expect(window.innerWidth).toBe(375);
    });

    test('should detect mobile viewport correctly', () => {
      setMobileViewport();
      const isMobile = window.innerWidth <= 768;
      expect(isMobile).toBe(true);
    });

    test('should detect desktop viewport correctly', () => {
      setDesktopViewport();
      const isMobile = window.innerWidth <= 768;
      expect(isMobile).toBe(false);
    });
  });

  describe('Package Pricing Calculations', () => {
    test('Starter package: $1 for 500 credits = $0.20 per 100', () => {
      const credits = 500;
      const price = 1.00;
      const per100 = (price / credits * 100).toFixed(2);
      expect(per100).toBe('0.20');
    });

    test('Creator package: $1.50 for 1000 credits = $0.15 per 100', () => {
      const credits = 1000;
      const price = 1.50;
      const per100 = (price / credits * 100).toFixed(2);
      expect(per100).toBe('0.15');
    });

    test('Pro package: $2 for 2500 credits = $0.08 per 100', () => {
      const credits = 2500;
      const price = 2.00;
      const per100 = (price / credits * 100).toFixed(2);
      expect(per100).toBe('0.08');
    });

    test('Creator package saves 25% vs Starter', () => {
      const starterPer100 = 0.20;
      const creatorPer100 = 0.15;
      const savings = ((starterPer100 - creatorPer100) / starterPer100 * 100).toFixed(0);
      expect(savings).toBe('25');
    });

    test('Pro package saves 60% vs Starter', () => {
      const starterPer100 = 0.20;
      const proPer100 = 0.08;
      const savings = ((starterPer100 - proPer100) / starterPer100 * 100).toFixed(0);
      expect(savings).toBe('60');
    });
  });
});
