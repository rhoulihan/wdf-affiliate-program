/**
 * Pricing Preview Component for Laundromat Affiliate Program
 * Reusable component that previews per-order earnings from the partner's flat
 * delivery fee + the WDF commission. (The V1 minimum/per-bag fee model was
 * removed in the 2026-06-23 audit — delivery is now a single flat fee per order,
 * constant regardless of bag count.)
 */

(function() {
  'use strict';

  // Constants for commission calculation
  const WDF_RATE = 1.40; // $1.40 per pound
  const LBS_PER_BAG = 30; // 30 lbs per bag average
  const COMMISSION_RATE = 0.10; // 10% commission

  /**
   * Create the pricing preview HTML structure
   * @param {string} containerId - The ID of the container element
   * @param {Object} options - Configuration options
   * @returns {void}
   */
  function createPricingPreview(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container with ID "${containerId}" not found`);
      return;
    }

    // Default options
    const config = {
      showTitle: true,
      titleText: options.titleText || 'Earnings Preview',
      showNotes: true,
      compact: false,
      ...options
    };

    // Create the HTML structure
    const html = `
      <div class="pricing-preview-component">
        ${config.showTitle ? `<p class="text-sm font-semibold text-gray-700 mb-3" data-i18n="${config.titleI18n || 'affiliate.dashboard.settings.earningsPreview'}">${config.titleText}</p>` : ''}

        <!-- Pricing Table -->
        <div class="mb-4">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200">
                <th class="text-left py-2 text-gray-600" data-i18n="affiliate.register.bags">Bags</th>
                <th class="text-right py-2 text-gray-600"><span data-i18n="affiliate.register.deliveryFee">Delivery</span><sup>1</sup></th>
                <th class="text-right py-2 text-gray-600"><span data-i18n="affiliate.register.yourCommission">Your Commission</span><sup>2</sup></th>
                <th class="text-right py-2 text-gray-600"><span data-i18n="affiliate.register.total">Total Earnings</span><sup>3</sup></th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-b border-gray-100">
                <td class="py-2 text-gray-600">1</td>
                <td class="text-right py-2 text-gray-600" id="${containerId}-calc1bag">$25</td>
                <td class="text-right py-2 text-green-600" id="${containerId}-comm1bag">$3.75</td>
                <td class="text-right py-2 font-semibold text-blue-600" id="${containerId}-total1bag">$28.75</td>
              </tr>
              <tr class="border-b border-gray-100">
                <td class="py-2 text-gray-600">3</td>
                <td class="text-right py-2 text-gray-600" id="${containerId}-calc3bags">$25</td>
                <td class="text-right py-2 text-green-600" id="${containerId}-comm3bags">$11.25</td>
                <td class="text-right py-2 font-semibold text-blue-600" id="${containerId}-total3bags">$36.25</td>
              </tr>
              <tr class="border-b border-gray-100">
                <td class="py-2 text-gray-600">5</td>
                <td class="text-right py-2 text-gray-600" id="${containerId}-calc5bags">$25</td>
                <td class="text-right py-2 text-green-600" id="${containerId}-comm5bags">$18.75</td>
                <td class="text-right py-2 font-semibold text-blue-600" id="${containerId}-total5bags">$43.75</td>
              </tr>
              <tr>
                <td class="py-2 text-gray-600">10</td>
                <td class="text-right py-2 text-gray-600" id="${containerId}-calc10bags">$25</td>
                <td class="text-right py-2 text-green-600" id="${containerId}-comm10bags">$37.50</td>
                <td class="text-right py-2 font-semibold text-blue-600" id="${containerId}-total10bags">$62.50</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${config.showNotes ? `
        <div class="text-xs text-gray-500 space-y-1">
          <p data-i18n="affiliate.register.paymentNote">Your flat delivery fee is charged once per order, regardless of bag count.</p>
          <p data-i18n="affiliate.register.deliveryNote">1. Delivery: 100% of the delivery fee goes to you</p>
          <p data-i18n="affiliate.register.commissionNote">2. Commission: 10% of WDF service (30 lbs × $1.25/lb per bag)</p>
          <p data-i18n="affiliate.register.totalNote">3. Total Earnings: Delivery fee + Commission</p>
        </div>
        ` : ''}
      </div>
    `;

    container.innerHTML = html;

    // Initialize i18n for the new elements if available
    if (window.i18n && window.i18n.translateElement) {
      window.i18n.translateElement(container);
    }
  }

  /**
   * Update the pricing preview with a new flat delivery fee.
   * @param {string} containerId - The ID of the container element
   * @param {number} flatFee - The partner's flat delivery fee (per order)
   * @returns {void}
   */
  function updatePricingPreview(containerId, flatFee) {
    // Ensure we have a valid number
    const deliveryFee = Number.isFinite(parseFloat(flatFee)) ? parseFloat(flatFee) : 25;

    // Update all example calculations. Delivery is the SAME flat fee per order;
    // only the WDF commission scales with bag count.
    [1, 3, 5, 10].forEach(bags => {
      // Calculate WDF commission
      const wdfRevenue = bags * LBS_PER_BAG * WDF_RATE;
      const commission = wdfRevenue * COMMISSION_RATE;

      // Update delivery fee display (flat, constant)
      const feeElement = document.getElementById(`${containerId}-calc${bags}bag${bags > 1 ? 's' : ''}`);
      if (feeElement) {
        feeElement.textContent = `$${deliveryFee}`;
        feeElement.title = `Flat delivery fee: $${deliveryFee} per order`;
      }

      // Update commission display
      const commElement = document.getElementById(`${containerId}-comm${bags}bag${bags > 1 ? 's' : ''}`);
      if (commElement) {
        commElement.textContent = `$${commission.toFixed(2)}`;
        commElement.title = `${bags} bags × ${LBS_PER_BAG} lbs × $${WDF_RATE}/lb × ${COMMISSION_RATE * 100}% = $${commission.toFixed(2)}`;
      }

      // Calculate and update total earnings (delivery + commission)
      const totalEarnings = deliveryFee + commission;
      const totalElement = document.getElementById(`${containerId}-total${bags}bag${bags > 1 ? 's' : ''}`);
      if (totalElement) {
        totalElement.textContent = `$${totalEarnings.toFixed(2)}`;
        totalElement.title = `Delivery: $${deliveryFee} + Commission: $${commission.toFixed(2)} = $${totalEarnings.toFixed(2)}`;
      }
    });
  }

  /**
   * Initialize a pricing preview component bound to a single flat-fee input.
   * @param {string} containerId - The ID of the container element
   * @param {string} deliveryFeeInputId - The ID of the flat delivery-fee input
   * @param {Object} options - Configuration options
   * @returns {Object} Component instance with update method
   */
  function initPricingPreview(containerId, deliveryFeeInputId, options = {}) {
    // Create the preview HTML
    createPricingPreview(containerId, options);

    // Get the input element
    const deliveryFeeInput = document.getElementById(deliveryFeeInputId);

    // Function to update the preview
    const update = () => {
      const flatFee = parseFloat(deliveryFeeInput?.value);
      updatePricingPreview(containerId, Number.isFinite(flatFee) ? flatFee : 25);
    };

    // Bind to input changes if the input exists
    if (deliveryFeeInput) {
      deliveryFeeInput.addEventListener('input', update);
      deliveryFeeInput.addEventListener('change', update);
    }

    // Initial update
    update();

    // Return component instance
    return {
      update,
      destroy: () => {
        if (deliveryFeeInput) {
          deliveryFeeInput.removeEventListener('input', update);
          deliveryFeeInput.removeEventListener('change', update);
        }
      }
    };
  }

  // Export to global scope
  window.PricingPreviewComponent = {
    create: createPricingPreview,
    update: updatePricingPreview,
    init: initPricingPreview
  };

})();
