// ===========================================
// PAYMENT MODALS - Success/Failure UI
// ===========================================

// Close payment modal and clean up URL
function closePaymentModal() {
  document.getElementById('paymentSuccessModal').classList.remove('active');
  document.getElementById('paymentFailureModal').classList.remove('active');
  // Clean up URL by removing payment parameters
  const url = new URL(window.location);
  url.searchParams.delete('payment');
  url.searchParams.delete('tier');
  window.history.replaceState({}, '', url);
}

// Create confetti animation for success modal
function createConfetti() {
  const colors = ['#00ff88', '#ff2ebb', '#00b2ff', '#ffaa00'];
  const confettiCount = 50;

  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.animationDelay = Math.random() * 0.5 + 's';
    confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';

    document.getElementById('paymentSuccessModal').appendChild(confetti);

    // Remove after animation
    setTimeout(() => confetti.remove(), 3500);
  }
}

// Show payment success modal with appropriate message
function showPaymentSuccess(tier) {
  const modal = document.getElementById('paymentSuccessModal');
  const message = document.getElementById('paymentSuccessMessage');

  // Update message based on tier/transaction type
  const messages = {
    'starter': 'You\'re now subscribed to the Starter Plan! Your credits have been added to your account.',
    'creator': 'You\'re now subscribed to the Creator Plan! Your credits have been added to your account.',
    'pro': 'You\'re now subscribed to the Pro Plan! Your credits have been added to your account.',
    'supernova': 'Welcome to Supernova Membership! You now have access to exclusive community channels.',
    'mentorship': 'Welcome to the Mentorship Program! You now have access to 1-on-1 guidance and private channels.',
    'credits_500': 'Successfully purchased 500 credits! Your credits have been added to your account.',
    'credits_1000': 'Successfully purchased 1,000 credits! Your credits have been added to your account.',
    'credits_2500': 'Successfully purchased 2,500 credits! Your credits have been added to your account.',
    'character': 'Character purchased successfully! The character is now available in your Flux and Qwen dropdowns.'
  };

  message.textContent = messages[tier] || 'Purchase successful! Your payment has been processed.';

  modal.classList.add('active');
  createConfetti();

  // Reload user profile to show new credits
  if (typeof bootstrapUser === 'function') {
    setTimeout(() => bootstrapUser(), 1000);
  }
}

// Show payment failure modal
function showPaymentFailure() {
  document.getElementById('paymentFailureModal').classList.add('active');
}

// Check for payment status in URL on page load
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const paymentStatus = urlParams.get('payment');
  const tier = urlParams.get('tier');

  if (paymentStatus === 'success') {
    setTimeout(() => showPaymentSuccess(tier), 500);
  } else if (paymentStatus === 'failed') {
    setTimeout(() => showPaymentFailure(), 500);
  }
});

// Triple-tap 'p' to toggle payment test panel (dev feature)
let pKeyPressCount = 0;
let pKeyTimer = null;
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    // Ignore if user is typing in an input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    pKeyPressCount++;

    if (pKeyPressCount === 3) {
      const panel = document.getElementById('paymentTestPanel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      pKeyPressCount = 0;
      clearTimeout(pKeyTimer);
    } else {
      clearTimeout(pKeyTimer);
      pKeyTimer = setTimeout(() => {
        pKeyPressCount = 0;
      }, 500);
    }
  }
});
