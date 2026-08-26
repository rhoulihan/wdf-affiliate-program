/**
 * Pricing Preview Component for Laundromat Affiliate Program
 * The affiliate's earnings are their flat delivery fee per order, kept 100%,
 * constant regardless of bag count. There is no WDF commission.
 */

(function() {
  'use strict';

  /**
   * Create the earnings preview HTML structure
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

    const config = {
      showTitle: true,
      titleText: options.titleText || 'Earnings Preview',
      showNotes: true,
      ...options
    };

    const html = `
      <div class="pricing-preview-component">
        ${config.showTitle ? `<p class="text-sm font-semibold text-gray-700 mb-3" data-i18n="${config.titleI18n || 'affiliate.dashboard.settings.earningsPreview'}">${config.titleText}</p>` : ''}

        <div class="mb-3">
          <div class="flex items-center justify-between py-2 border-b border-gray-200">
            <span class="text-sm text-gray-600" data-i18n="affiliate.register.yourEarningsPerOrder">Your earnings per order</span>
            <span class="text-lg font-semibold text-blue-600" id="${containerId}-earnings">$25</span>
          </div>
        </div>

        ${config.showNotes ? `
        <div class="text-xs text-gray-500 space-y-1">
          <p data-i18n="affiliate.register.paymentNote">Your flat delivery fee is charged once per order, regardless of bag count.</p>
          <p data-i18n="affiliate.register.earningsNote">You keep 100% of your flat delivery fee as your earnings.</p>
        </div>
        ` : ''}
      </div>
    `;

    container.innerHTML = html;

    if (window.i18n && window.i18n.translateElement) {
      window.i18n.translateElement(container);
    }
  }

  /**
   * Update the earnings preview with a new flat delivery fee.
   * @param {string} containerId - The ID of the container element
   * @param {number} flatFee - The partner's flat delivery fee (per order)
   * @returns {void}
   */
  function updatePricingPreview(containerId, flatFee) {
    const deliveryFee = Number.isFinite(parseFloat(flatFee)) ? parseFloat(flatFee) : 25;
    const earningsElement = document.getElementById(`${containerId}-earnings`);
    if (earningsElement) {
      earningsElement.textContent = `$${deliveryFee}`;
      earningsElement.title = `Flat delivery fee: $${deliveryFee} per order (you keep 100%)`;
    }
  }

  /**
   * Initialize an earnings preview component bound to a single flat-fee input.
   * @param {string} containerId - The ID of the container element
   * @param {string} deliveryFeeInputId - The ID of the flat delivery-fee input
   * @param {Object} options - Configuration options
   * @returns {Object} Component instance with update method
   */
  function initPricingPreview(containerId, deliveryFeeInputId, options = {}) {
    createPricingPreview(containerId, options);

    const deliveryFeeInput = document.getElementById(deliveryFeeInputId);

    const update = () => {
      const flatFee = parseFloat(deliveryFeeInput?.value);
      updatePricingPreview(containerId, Number.isFinite(flatFee) ? flatFee : 25);
    };

    if (deliveryFeeInput) {
      deliveryFeeInput.addEventListener('input', update);
      deliveryFeeInput.addEventListener('change', update);
    }

    update();

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

  window.PricingPreviewComponent = {
    create: createPricingPreview,
    update: updatePricingPreview,
    init: initPricingPreview
  };

})();
