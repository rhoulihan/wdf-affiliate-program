// Revenue Calculator for Affiliate Landing Page

console.log('Revenue calculator script loaded');

// Function to initialize the calculator
async function initializeCalculator() {
  console.log('Initializing revenue calculator...');
  let wdfRate = 1.40; // Default rate

  // Calculate earnings function
  function calculateEarnings() {
    try {
      const customers = parseFloat(document.getElementById('calc-customers').value) || 0;
      const weight = parseFloat(document.getElementById('calc-weight').value) || 0;
      const deliveryFee = parseFloat(document.getElementById('calc-delivery').value) || 0;

      console.log('Calculating with:', { customers, weight, deliveryFee, wdfRate });

      // Calculate weekly earnings
      const weeklyWdfRevenue = customers * weight * wdfRate;
      const weeklyWdfCommission = weeklyWdfRevenue * 0.10; // 10% commission
      const weeklyDeliveryEarnings = customers * deliveryFee;
      const weeklyTotal = weeklyWdfCommission + weeklyDeliveryEarnings;

      // Calculate monthly earnings (4 weeks)
      const monthlyTotal = weeklyTotal * 4;

      console.log('Results:', { weeklyTotal, monthlyTotal, weeklyWdfCommission, weeklyDeliveryEarnings });

      // Update display
      const weeklyEarningsEl = document.getElementById('weekly-earnings');
      const monthlyEarningsEl = document.getElementById('monthly-earnings');
      const wdfCommissionEl = document.getElementById('wdf-commission');
      const deliveryEarningsEl = document.getElementById('delivery-earnings');

      if (weeklyEarningsEl) weeklyEarningsEl.textContent = weeklyTotal.toFixed(2);
      if (monthlyEarningsEl) monthlyEarningsEl.textContent = monthlyTotal.toFixed(2);
      if (wdfCommissionEl) wdfCommissionEl.textContent = weeklyWdfCommission.toFixed(2);
      if (deliveryEarningsEl) deliveryEarningsEl.textContent = weeklyDeliveryEarnings.toFixed(2);
    } catch (error) {
      console.error('Error in calculateEarnings:', error);
    }
  }

  // Check if elements exist
  const calcCustomers = document.getElementById('calc-customers');
  const calcWeight = document.getElementById('calc-weight');
  const calcDelivery = document.getElementById('calc-delivery');

  if (!calcCustomers || !calcWeight || !calcDelivery) {
    console.error('Calculator input elements not found');
    return;
  }

  // Add event listeners
  calcCustomers.addEventListener('input', calculateEarnings);
  calcWeight.addEventListener('input', calculateEarnings);
  calcDelivery.addEventListener('input', calculateEarnings);

  // Mark as initialized to prevent duplicate initialization
  calcCustomers.setAttribute('data-calculator-initialized', 'true');

  // Run initial calculation with default values
  console.log('Running initial calculation...');
  calculateEarnings();

  // Fetch WDF rate from API and recalculate if needed
  try {
    // Use relative URL when embedded
    const baseUrl = window.location.origin.includes('rundberglaundry.com')
      ? 'https://rundberglaundry.com'
      : window.location.origin;

    const response = await fetch(`${baseUrl}/api/v1/system/config/public`);
    if (response.ok) {
      const configs = await response.json();
      const wdfConfig = configs.find(c => c.key === 'wdf_base_rate_per_pound');
      if (wdfConfig && wdfConfig.currentValue !== wdfRate) {
        wdfRate = wdfConfig.currentValue;
        const wdfRateDisplay = document.getElementById('wdf-rate-display');
        if (wdfRateDisplay) {
          wdfRateDisplay.textContent = wdfRate.toFixed(2);
        }
        // Recalculate with the fetched rate
        console.log('Recalculating with new WDF rate:', wdfRate);
        calculateEarnings();
      }
    }
  } catch (error) {
    console.error('Error fetching WDF rate:', error);
  }
}

// Try multiple initialization strategies
// 1. If DOM is already loaded (for dynamic content)
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  console.log('DOM already ready, initializing immediately');
  setTimeout(initializeCalculator, 100); // Small delay to ensure elements are rendered
}

// 2. Listen for DOMContentLoaded (for direct page load)
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOMContentLoaded fired, initializing calculator');
  initializeCalculator();
});

// 3. Also try on window load as fallback
window.addEventListener('load', function() {
  console.log('Window load fired, checking if calculator needs initialization');
  // Check if calculator is already initialized by checking if event listeners are attached
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
  console.log(`Checking for calculator elements (attempt ${initAttempts})...`);

  if (calcCustomers && !calcCustomers.hasAttribute('data-calculator-initialized')) {
    console.log('Found calculator elements, initializing...');
    initializeCalculator();
    clearInterval(initInterval);
  } else if (calcCustomers && calcCustomers.hasAttribute('data-calculator-initialized')) {
    console.log('Calculator already initialized');
    clearInterval(initInterval);
  } else if (initAttempts > 20) { // Stop after 10 seconds
    console.log('Calculator elements not found after 20 attempts');
    clearInterval(initInterval);
  }
}, 500);