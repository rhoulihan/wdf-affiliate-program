// Revenue Calculator for Affiliate Landing Page
// The affiliate's earnings are their flat delivery fee per order, kept 100%.
// There is no WDF commission.

function initializeCalculator() {
  function calculateEarnings() {
    try {
      const customers = parseFloat(document.getElementById('calc-customers').value) || 0;
      const deliveryFee = parseFloat(document.getElementById('calc-delivery').value) || 0;

      // Each active customer places one order per week; the affiliate keeps 100%
      // of their flat delivery fee on each order.
      const weeklyTotal = customers * deliveryFee;
      const monthlyTotal = weeklyTotal * 4;

      const weeklyEarningsEl = document.getElementById('weekly-earnings');
      const monthlyEarningsEl = document.getElementById('monthly-earnings');
      const deliveryEarningsEl = document.getElementById('delivery-earnings');

      if (weeklyEarningsEl) weeklyEarningsEl.textContent = weeklyTotal.toFixed(2);
      if (monthlyEarningsEl) monthlyEarningsEl.textContent = monthlyTotal.toFixed(2);
      if (deliveryEarningsEl) deliveryEarningsEl.textContent = weeklyTotal.toFixed(2);
    } catch (error) {
      console.error('Error in calculateEarnings:', error);
    }
  }

  const calcCustomers = document.getElementById('calc-customers');
  const calcDelivery = document.getElementById('calc-delivery');

  if (!calcCustomers || !calcDelivery) {
    return;
  }

  calcCustomers.addEventListener('input', calculateEarnings);
  calcDelivery.addEventListener('input', calculateEarnings);

  // Mark as initialized to prevent duplicate initialization
  calcCustomers.setAttribute('data-calculator-initialized', 'true');

  // Run initial calculation with default values
  calculateEarnings();
}

// Try multiple initialization strategies
// 1. If DOM is already loaded (for dynamic content)
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(initializeCalculator, 100);
}

// 2. Listen for DOMContentLoaded (for direct page load)
document.addEventListener('DOMContentLoaded', initializeCalculator);

// 3. Also try on window load as fallback
window.addEventListener('load', function() {
  const calcCustomers = document.getElementById('calc-customers');
  if (calcCustomers && !calcCustomers.hasAttribute('data-calculator-initialized')) {
    initializeCalculator();
  }
});

// 4. For embed-app dynamic loading, also check periodically
let initAttempts = 0;
const initInterval = setInterval(function() {
  initAttempts++;
  const calcCustomers = document.getElementById('calc-customers');
  if (calcCustomers && !calcCustomers.hasAttribute('data-calculator-initialized')) {
    initializeCalculator();
    clearInterval(initInterval);
  } else if ((calcCustomers && calcCustomers.hasAttribute('data-calculator-initialized')) || initAttempts > 20) {
    clearInterval(initInterval);
  }
}, 500);
