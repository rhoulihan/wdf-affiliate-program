// Initialize ApiClient when dashboard is loaded
if (window.ApiClient) {
  ApiClient.initCSRF();
}

// Affiliate dashboard functionality for embedded environment
function initializeAffiliateDashboard() {
  const isEmbedded = window.EMBED_CONFIG?.isEmbedded || false;
  const baseUrl = window.EMBED_CONFIG?.baseUrl || window.location.origin;

  // Initialize ApiClient CSRF token
  if (window.ApiClient) {
    ApiClient.initCSRF();
  }

  // Check authentication
  const token = localStorage.getItem('affiliateToken');
  const currentAffiliate = JSON.parse(localStorage.getItem('currentAffiliate'));

  console.log('Dashboard initialization - Token:', token ? 'exists' : 'missing');
  console.log('Dashboard initialization - Affiliate:', currentAffiliate ? currentAffiliate.affiliateId : 'missing');

  // Update session activity if authenticated
  if (token && window.SessionManager) {
    window.SessionManager.updateActivity('affiliate');
  }

  if (!token || !currentAffiliate) {
    // Redirect to login if not authenticated
    if (isEmbedded) {
      // For embedded, use postMessage navigation
      console.log('Not authenticated, navigating to login');
      window.parent.postMessage({
        type: 'navigate',
        data: { page: '/affiliate-login' }
      }, '*');
    } else {
      window.location.href = '/embed-app-v2.html?route=/affiliate-login';
    }
    return;
  }

  // Get affiliate ID from current affiliate data
  const affiliateId = currentAffiliate.affiliateId;

  // Set affiliate ID in the page
  const affiliateIdElement = document.getElementById('affiliateId');
  if (affiliateIdElement) {
    affiliateIdElement.textContent = `Affiliate ID: ${affiliateId}`;
  }

  // Load affiliate data
  loadAffiliateData(affiliateId);

  // Load dashboard statistics
  loadDashboardStats(affiliateId);

  // Load settings data on initial load
  loadSettingsData(affiliateId);

  // PR 9: delivery code card
  initDeliveryCodeCard(affiliateId);

  // Check URL parameters for specific customer filtering
  // Try both window.location.search and the global urlParams if available
  const urlParams = new URLSearchParams(window.location.search);
  let filterCustomerId = urlParams.get('customer');

  // Also check if embed-app-v2.html has parsed parameters globally
  if (!filterCustomerId && window.location.search.includes('customer=')) {
    const searchParams = window.location.search;
    const customerMatch = searchParams.match(/customer=([^&]+)/);
    if (customerMatch) {
      filterCustomerId = customerMatch[1];
    }
  }

  console.log('Dashboard initialization - customer filter:', filterCustomerId);

  // Tab loading is handled below when we restore the saved tab or switch to customers

  // Setup tab navigation
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Function to switch to a specific tab
  function switchToTab(tabId, updateHistory = true) {
    // Resolve the target button first; fall back to the default tab if it
    // no longer exists (e.g. stale localStorage/bookmark for a removed tab)
    const targetButton = document.querySelector(`[data-tab="${tabId}"]`);
    if (!targetButton) {
      if (tabId !== 'pickups') {
        switchToTab('pickups', updateHistory);
      }
      return;
    }

    // Remove active class from all buttons and tabs
    tabButtons.forEach(btn => {
      btn.classList.remove('border-blue-600');
      btn.classList.remove('text-blue-600');
      btn.classList.add('border-transparent');
    });

    tabContents.forEach(content => {
      content.classList.remove('active');
    });

    // Activate the tab button
    targetButton.classList.add('border-blue-600');
    targetButton.classList.add('text-blue-600');
    targetButton.classList.remove('border-transparent');

    const tabContent = document.getElementById(`${tabId}-tab`);
    if (tabContent) {
      tabContent.classList.add('active');
    }

    // Save current tab to localStorage
    localStorage.setItem('affiliateCurrentTab', tabId);

    // Update URL with tab parameter for browser history (only if not from popstate)
    if (updateHistory && window.updateTabInUrl) {
      window.updateTabInUrl(tabId);
    }

    // Always load tab-specific data
    console.log('[Affiliate Dashboard] Loading data for tab:', tabId);
    if (tabId === 'pickups') {
      loadPickupRequests(affiliateId);
    } else if (tabId === 'customers') {
      loadCustomers(affiliateId);
    } else if (tabId === 'invoices') {
      loadInvoices(affiliateId);
    } else if (tabId === 'settings') {
      loadSettingsData(affiliateId);
    }
  }

  // Add click handlers to tab buttons
  tabButtons.forEach(button => {
    button.addEventListener('click', function() {
      const tabId = this.getAttribute('data-tab');
      switchToTab(tabId);
    });
  });

  // Check URL for tab parameter first, then handle customer filter, then localStorage
  const urlTab = urlParams.get('tab');
  
  if (filterCustomerId) {
    // If filtering by customer, switch to customers tab
    setTimeout(() => {
      switchToTab('customers');
      // Apply the filter after tab loads
      setTimeout(() => {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
          searchInput.value = filterCustomerId;
          searchInput.dispatchEvent(new Event('input'));
        }
      }, 300);
    }, 500);
  } else if (urlTab) {
    // URL tab parameter takes precedence
    switchToTab(urlTab);
  } else {
    // Restore saved tab or default to pickups
    const savedTab = localStorage.getItem('affiliateCurrentTab') || 'pickups';
    switchToTab(savedTab);
  }

  // Listen for tab restore messages from browser navigation
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'restore-tab' && event.data.tab) {
      console.log('[Affiliate Dashboard] Restoring tab from browser navigation:', event.data.tab);
      // Don't update history when restoring from popstate
      switchToTab(event.data.tab, false);
    }
  });

  // Logout functionality
  const logoutBtn = document.getElementById('logoutBtn');
  console.log('Logout button found:', logoutBtn);
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('Logout button clicked');
      localStorage.removeItem('affiliateToken');
      localStorage.removeItem('currentAffiliate');
      localStorage.removeItem('affiliateCurrentTab');
      localStorage.removeItem('currentRoute');

      // Clear session manager data
      if (window.SessionManager) {
        window.SessionManager.clearAuth('affiliate');
      }

      if (isEmbedded) {
        console.log('Sending logout navigation message');
        // For embedded, use postMessage navigation
        window.parent.postMessage({
          type: 'navigate',
          data: { page: '/affiliate-login' }
        }, '*');

        // Fallback direct navigation after a short delay
        setTimeout(() => {
          console.log('Fallback: Direct navigation to login');
          window.location.href = '/embed-app-v2.html?route=/affiliate-login';
        }, 500);
      } else {
        window.location.href = '/embed-app-v2.html?route=/affiliate-login';
      }
    });
  } else {
    console.error('Logout button not found in DOM');
  }

  // Schedule pickup button removed - affiliates should not schedule pickups

  // Copy landing page link button
  const copyLandingBtn = document.getElementById('copyLandingPageLinkBtn');
  if (copyLandingBtn) {
    copyLandingBtn.addEventListener('click', function() {
      copyLandingPageLink();
    });
  }

  // Marketing Links Hover Modal
  const marketingLinksBtn = document.getElementById('marketingLinksBtn');
  const marketingLinksModal = document.getElementById('marketingLinksModal');
  let modalTimeout;

  if (marketingLinksBtn && marketingLinksModal) {
    // Show modal on hover
    marketingLinksBtn.addEventListener('mouseenter', function() {
      clearTimeout(modalTimeout);
      marketingLinksModal.style.display = 'block';
    });

    // Keep modal open when hovering over it
    marketingLinksModal.addEventListener('mouseenter', function() {
      clearTimeout(modalTimeout);
    });

    // Hide modal when mouse leaves button
    marketingLinksBtn.addEventListener('mouseleave', function() {
      modalTimeout = setTimeout(() => {
        marketingLinksModal.style.display = 'none';
      }, 300); // Small delay to allow moving to modal
    });

    // Hide modal when mouse leaves modal
    marketingLinksModal.addEventListener('mouseleave', function() {
      modalTimeout = setTimeout(() => {
        marketingLinksModal.style.display = 'none';
      }, 300);
    });

    // Also show/hide on click for mobile devices
    marketingLinksBtn.addEventListener('click', function(e) {
      e.preventDefault();
      if (marketingLinksModal.style.display === 'none') {
        marketingLinksModal.style.display = 'block';
      } else {
        marketingLinksModal.style.display = 'none';
      }
    });

    // Hide modal when clicking outside
    document.addEventListener('click', function(e) {
      if (!marketingLinksBtn.contains(e.target) && !marketingLinksModal.contains(e.target)) {
        marketingLinksModal.style.display = 'none';
      }
    });
  }

  // Update translations for dynamically loaded content
  // This is needed because the modal content might not be translated on initial load
  function updateDashboardTranslations() {
    if (window.i18n && window.i18n.translatePage) {
      console.log('Updating translations for dashboard content');
      
      // Debug: Check what translations are available
      if (window.i18n.translations && window.i18n.currentLanguage) {
        console.log('Current language:', window.i18n.currentLanguage);
        console.log('Available translations:', window.i18n.translations[window.i18n.currentLanguage]);
        
        // Try to access the marketing links translations
        try {
          const trans = window.i18n.translations[window.i18n.currentLanguage];
          console.log('Affiliate section:', trans?.affiliate);
          console.log('Dashboard section:', trans?.affiliate?.dashboard);
          console.log('Marketing links translations:', trans?.affiliate?.dashboard?.marketingLinks);
        } catch (e) {
          console.error('Error accessing translations:', e);
        }
      }
      
      // Call the standard translate page function
      window.i18n.translatePage();
      
      // Force update specific elements that might not be translating
      const elementsToTranslate = [
        { id: 'marketingLinksBtn', selector: '[data-i18n]' },
        { id: 'marketingLinksModal', selector: '[data-i18n]' }
      ];
      
      elementsToTranslate.forEach(({ id, selector }) => {
        const container = document.getElementById(id);
        if (container) {
          const elements = container.querySelectorAll(selector);
          elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (key && window.i18n && window.i18n.t) {
              const translation = window.i18n.t(key);
              console.log(`Forcing translation - Key: "${key}", Result: "${translation}"`);
              
              // Only update if we got a valid translation (not the key itself)
              if (translation && translation !== key && !translation.includes('.')) {
                element.textContent = translation;
                console.log(`Updated element with translation: "${translation}"`);
              } else {
                console.warn(`Translation failed for key: "${key}"`);
              }
            }
          });
        }
      });
    }
  }
  
  // Call after a delay to ensure all content is loaded
  setTimeout(updateDashboardTranslations, 500);
  
  // Also call when showing the modal for the first time
  if (marketingLinksBtn) {
    marketingLinksBtn.addEventListener('mouseenter', function() {
      // Update translations when modal is first shown
      if (window.i18n && !this.dataset.translationsUpdated) {
        updateDashboardTranslations();
        this.dataset.translationsUpdated = 'true';
      }
    }, { once: true });
  }

  // Settings form edit mode
  const editBtn = document.getElementById('editBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const settingsForm = document.getElementById('settingsForm');
  const formButtons = document.getElementById('formButtons');

  if (editBtn) {
    editBtn.addEventListener('click', function() {
      enableEditMode();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', function() {
      disableEditMode();
      loadSettingsData(affiliateId); // Reload original data
    });
  }

  if (settingsForm) {
    settingsForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      await saveSettings(affiliateId);
    });
  }

  // Change password form
  const changePasswordForm = document.getElementById('changePasswordForm');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      await changePassword(affiliateId);
    });
  }

  // Delete data button (development only)
  const deleteBtn = document.getElementById('deleteAllDataBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', function() {
      deleteAllData(affiliateId);
    });
  }

  // Check if we should show delete section
  checkAndShowDeleteSection();

  // Make functions available globally (they're used by the existing dashboard code)
  window.loadAffiliateData = loadAffiliateData;
  window.loadDashboardStats = loadDashboardStats;
  window.loadPickupRequests = loadPickupRequests;
  window.loadCustomers = loadCustomers;
  window.loadInvoices = loadInvoices;
  window.loadSettingsData = loadSettingsData;
}

// Function to switch to customers tab and highlight specific customer
function switchToCustomersTab(affiliateId, customerIdToHighlight) {
  // Switch to customers tab
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Remove active class from all buttons and tabs
  tabButtons.forEach(btn => {
    btn.classList.remove('border-blue-600');
    btn.classList.remove('text-blue-600');
    btn.classList.add('border-transparent');
  });

  tabContents.forEach(content => {
    content.classList.remove('active');
  });

  // Find and activate customers tab
  const customersTabBtn = document.querySelector('[data-tab="customers"]');
  if (customersTabBtn) {
    customersTabBtn.classList.add('border-blue-600');
    customersTabBtn.classList.add('text-blue-600');
    customersTabBtn.classList.remove('border-transparent');
  }

  const customersTabContent = document.getElementById('customers-tab');
  if (customersTabContent) {
    customersTabContent.classList.add('active');
  }

  // Load customers with highlighting
  loadCustomersWithHighlight(affiliateId, customerIdToHighlight);
}

// Function to initialize pricing preview component (flat-fee model)
function initializePricingPreview(affiliateData) {
  if (!window.PricingPreviewComponent) {
    console.warn('PricingPreviewComponent still not available');
    return;
  }

  // Set the read-only flat-fee input before init so the preview reflects it.
  const feeInput = document.getElementById('settingsDeliveryFee');
  if (feeInput) feeInput.value = parseFloat(affiliateData.deliveryFee) || 0;

  // Initialize the pricing preview in the settings tab
  window.settingsPricingPreview = window.PricingPreviewComponent.init(
    'settingsPricingPreview',
    'settingsDeliveryFee',
    {
      titleText: 'Earnings Preview',
      titleI18n: 'affiliate.dashboard.settings.earningsPreview',
      showNotes: true
    }
  );

  // Trigger update
  if (window.settingsPricingPreview) {
    window.settingsPricingPreview.update();
  }
}

// Copy the existing functions from affiliate-dashboard.js
async function loadAffiliateData(affiliateId) {
  try {
    const token = localStorage.getItem('affiliateToken');
    const result = await ApiClient.get(`/api/v1/affiliates/${affiliateId}`, {
      showError: false,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (result) {
      // Extract the actual affiliate data from the response
      const data = result.affiliate || result;

      // Update profile information with null checks
      const nameElement = document.getElementById('affiliateName');
      if (nameElement) nameElement.textContent = `${data.firstName} ${data.lastName}`;

      const emailElement = document.getElementById('affiliateEmail');
      if (emailElement) emailElement.textContent = data.email;

      const businessElement = document.getElementById('businessName');
      if (businessElement) businessElement.textContent = data.businessName || 'N/A';

      // Display the flat per-affiliate delivery fee (the partner's commission per
      // order). 0 / unset = Laundromat Associates handles delivery (house fee).
      const deliveryFeeElement = document.getElementById('deliveryFee');
      if (deliveryFeeElement) {
        const fee = parseFloat(data.deliveryFee);
        deliveryFeeElement.textContent = (fee > 0)
          ? `$${fee.toFixed(2)}`
          : (window.i18n ? window.i18n.t('affiliate.dashboard.settings.deliveryByAssociates') : ((window.BRAND && window.BRAND.name) || 'Laundromat') + ' Associates');
      }

      // Generate and display landing page link
      const landingPageLink = `${window.EMBED_CONFIG?.baseUrl || window.location.origin}/embed-app-v2.html?route=/affiliate-landing&code=${affiliateId}`;
      const landingPageElement = document.getElementById('landingPageLink');
      if (landingPageElement) landingPageElement.value = landingPageLink;

      // Store affiliate data in localStorage for other uses
      localStorage.setItem('currentAffiliate', JSON.stringify(data));

      // Initialize the pricing preview (flat-fee) in the settings tab.
      if (window.PricingPreviewComponent) {
        initializePricingPreview(data);
      } else {
        // Component script may not have loaded yet — retry shortly.
        setTimeout(() => {
          if (window.PricingPreviewComponent) {
            initializePricingPreview(data);
          }
        }, 500);
      }
    }
  } catch (error) {
    console.error('Error loading affiliate data:', error);
  }
}

async function loadDashboardStats(affiliateId) {
  try {
    const token = localStorage.getItem('affiliateToken');
    const data = await ApiClient.get(`/api/v1/affiliates/${affiliateId}/dashboard`, {
      showError: false,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (data) {
      console.log('Dashboard stats response:', data);

      // Extract stats from response
      const stats = data.stats || data;

      // Update dashboard statistics with null checks
      const customersElement = document.getElementById('totalCustomers');
      if (customersElement) customersElement.textContent = stats.customerCount || 0;

      const ordersElement = document.getElementById('activeOrders');
      if (ordersElement) ordersElement.textContent = stats.activeOrderCount || 0;

      const revenueElement = document.getElementById('monthlyRevenue');
      if (revenueElement) revenueElement.textContent = `$${(stats.monthEarnings || 0).toFixed(2)}`;

      const paymentElement = document.getElementById('pendingPayment');
      if (paymentElement) paymentElement.textContent = `$${(stats.pendingEarnings || 0).toFixed(2)}`;
    }
  } catch (error) {
    console.error('Error loading dashboard stats:', error);
  }
}

async function loadPickupRequests(affiliateId) {
  try {
    const token = localStorage.getItem('affiliateToken');
    const data = await ApiClient.get(`/api/v1/affiliates/${affiliateId}/orders`, {
      showError: false,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (data) {
      console.log('Orders response:', data);

      // Extract orders array from response
      const orders = data.orders || [];
      const tbody = document.getElementById('ordersTableBody');
      tbody.innerHTML = '';

      if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">No orders found</td></tr>';
      } else {
        orders.forEach(order => {
          // Get customer info from order
          const customerName = order.customer ?
            order.customer.name :
            'Unknown Customer';

          const address = order.customer ?
            order.customer.address :
            'No address';

          const row = document.createElement('tr');
          row.className = 'border-b hover:bg-gray-50';
          row.innerHTML = `
            <td class="py-3 px-4">${new Date(order.pickupDate).toLocaleDateString()}</td>
            <td class="py-3 px-4">${customerName}</td>
            <td class="py-3 px-4">${address}</td>
            <td class="py-3 px-4">
              <span class="px-2 py-1 rounded text-xs ${
  order.status === 'pending' ? 'bg-gray-100 text-gray-800' :
    order.status === 'scheduled' ? 'bg-yellow-100 text-yellow-800' :
      order.status === 'processing' ? 'bg-blue-100 text-blue-800' :
        order.status === 'processed' ? 'bg-purple-100 text-purple-800' :
          order.status === 'complete' ? 'bg-green-100 text-green-800' :
            order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
}">
                ${order.status.replace(/_/g, ' ')}
              </span>
            </td>
            <td class="py-3 px-4">
              <span class="text-gray-600">Order #${order.orderId}</span>
            </td>
          `;
          tbody.appendChild(row);
        });
      }
    }
  } catch (error) {
    console.error('Error loading pickup requests:', error);
  }
}

async function loadCustomers(affiliateId) {
  await loadCustomersWithHighlight(affiliateId, null);
}

async function loadCustomersWithHighlight(affiliateId, highlightCustomerId) {
  try {
    const token = localStorage.getItem('affiliateToken');
    const data = await ApiClient.get(`/api/v1/affiliates/${affiliateId}/customers`, {
      showError: false,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (data) {
      console.log('Customers response:', data);

      // Extract customers array from response
      const customers = data.customers || [];
      const tbody = document.getElementById('customersTableBody');
      tbody.innerHTML = '';

      if (customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-500">No customers found</td></tr>';
      } else {
        customers.forEach(customer => {
          const row = document.createElement('tr');
          const isHighlighted = highlightCustomerId && customer.customerId === highlightCustomerId;

          row.className = `border-b ${isHighlighted ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'}`;

          row.innerHTML = `
            <td class="py-3 px-4">
              ${isHighlighted ? '<span class="font-bold text-blue-800">★ </span>' : ''}
              ${customer.firstName} ${customer.lastName}
              ${isHighlighted ? ' <span class="text-xs text-blue-600">(New Registration)</span>' : ''}
            </td>
            <td class="py-3 px-4">${customer.email}</td>
            <td class="py-3 px-4">${customer.phone}</td>
            <td class="py-3 px-4">
              <span class="px-2 py-1 rounded text-xs ${
  customer.isActive !== false ? 'bg-green-100 text-green-800' :
    'bg-gray-100 text-gray-800'
}">
                ${customer.isActive !== false ? 'Active' : 'Inactive'}
              </span>
            </td>
          `;
          tbody.appendChild(row);
        });

        // Scroll highlighted customer into view if found
        if (highlightCustomerId) {
          const highlightedRow = tbody.querySelector('tr.bg-blue-50');
          if (highlightedRow) {
            setTimeout(() => {
              highlightedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error loading customers:', error);
  }
}

async function loadInvoices(affiliateId) {
  try {
    const token = localStorage.getItem('affiliateToken');
    const invoices = await ApiClient.get(`/api/v1/affiliates/${affiliateId}/invoices`, {
      showError: false,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (invoices) {
      const tbody = document.querySelector('#invoicesTable tbody');
      tbody.innerHTML = '';

      if (invoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">No invoices found</td></tr>';
      } else {
        invoices.forEach(invoice => {
          const row = document.createElement('tr');
          row.className = 'border-b hover:bg-gray-50';
          row.innerHTML = `
            <td class="py-3 px-4">${invoice.number}</td>
            <td class="py-3 px-4">${new Date(invoice.date).toLocaleDateString()}</td>
            <td class="py-3 px-4">$${invoice.amount.toFixed(2)}</td>
            <td class="py-3 px-4">
              <span class="px-2 py-1 rounded text-xs ${
  invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
    invoice.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
      'bg-gray-100 text-gray-800'
}">
                ${invoice.status}
              </span>
            </td>
            <td class="py-3 px-4">
              <button class="text-blue-600 hover:underline">Download</button>
            </td>
          `;
          tbody.appendChild(row);
        });
      }
    }
  } catch (error) {
    console.error('Error loading invoices:', error);
  }
}

// Show manual copy prompt
function showManualCopyPrompt(text) {
  // Create a temporary textarea for better compatibility
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '50%';
  textarea.style.left = '50%';
  textarea.style.transform = 'translate(-50%, -50%)';
  textarea.style.width = '80%';
  textarea.style.maxWidth = '400px';
  textarea.style.height = '100px';
  textarea.style.padding = '10px';
  textarea.style.border = '2px solid #1e3a8a';
  textarea.style.borderRadius = '8px';
  textarea.style.backgroundColor = 'white';
  textarea.style.zIndex = '10000';
  textarea.style.fontSize = '14px';

  // Create overlay
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
  overlay.style.zIndex = '9999';

  // Create instruction text
  const instruction = document.createElement('div');
  instruction.textContent = 'Press Ctrl+C (or Cmd+C) to copy, then click anywhere to close';
  instruction.style.position = 'fixed';
  instruction.style.top = 'calc(50% - 70px)';
  instruction.style.left = '50%';
  instruction.style.transform = 'translateX(-50%)';
  instruction.style.color = 'white';
  instruction.style.fontSize = '16px';
  instruction.style.fontWeight = 'bold';
  instruction.style.zIndex = '10001';
  instruction.style.textAlign = 'center';

  document.body.appendChild(overlay);
  document.body.appendChild(instruction);
  document.body.appendChild(textarea);

  // Select the text
  textarea.focus();
  textarea.select();

  // Remove elements when clicked
  const cleanup = () => {
    document.body.removeChild(textarea);
    document.body.removeChild(overlay);
    document.body.removeChild(instruction);
  };

  overlay.addEventListener('click', cleanup);
  textarea.addEventListener('blur', () => {
    setTimeout(cleanup, 100);
  });
}

// Show copy success feedback
function copyLandingPageLink() {
  const linkInput = document.getElementById('landingPageLink');
  const copyBtn = document.getElementById('copyLandingPageLinkBtn');

  // Use setTimeout to ensure our code runs in a clean call stack
  setTimeout(() => {
    // Focus the input first
    linkInput.focus();
    linkInput.select();

    try {
      // Use execCommand which works better in iframes
      const successful = document.execCommand('copy');
      if (successful) {
        showCopySuccess(copyBtn);
        // Blur the input after successful copy
        linkInput.blur();
      } else {
        // If copy fails, show the text for manual copying
        linkInput.blur();
        showManualCopyPrompt(linkInput.value);
      }
    } catch (err) {
      console.error('Unable to copy:', err);
      linkInput.blur();
      showManualCopyPrompt(linkInput.value);
    }
  }, 100);
}

function showCopySuccess(button) {
  const originalText = button.textContent;
  button.textContent = 'Copied!';
  button.classList.remove('bg-blue-600', 'hover:bg-blue-700');
  button.classList.add('bg-green-600', 'hover:bg-green-700');

  setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove('bg-green-600', 'hover:bg-green-700');
    button.classList.add('bg-blue-600', 'hover:bg-blue-700');
  }, 2000);
}

// Load settings data
async function loadSettingsData(affiliateId) {
  try {
    console.log('Loading settings data for affiliate:', affiliateId);
    const token = localStorage.getItem('affiliateToken');
    const result = await ApiClient.get(`/api/v1/affiliates/${affiliateId}`, {
      showError: false,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (result) {
      console.log('Affiliate data received:', result);

      // Extract the actual affiliate data from the response
      const data = result.affiliate || result;
      console.log('Extracted affiliate data:', data);

      // Wait a bit to ensure DOM is ready
      setTimeout(() => {
        // Populate settings fields with null checks
        const firstNameField = document.getElementById('settingsFirstName');
        const lastNameField = document.getElementById('settingsLastName');
        const emailField = document.getElementById('settingsEmail');
        const phoneField = document.getElementById('settingsPhone');
        const businessNameField = document.getElementById('settingsBusinessName');
        const deliveryFeeField = document.getElementById('settingsDeliveryFee');

        if (firstNameField) firstNameField.value = data.firstName || '';
        if (lastNameField) lastNameField.value = data.lastName || '';
        if (emailField) emailField.value = data.email || '';
        if (phoneField) phoneField.value = data.phone || '';
        if (businessNameField) businessNameField.value = data.businessName || '';

        // Flat delivery fee (read-only; admin-managed).
        if (deliveryFeeField) deliveryFeeField.value = parseFloat(data.deliveryFee) || 0;

        // Initialize pricing preview component (flat-fee)
        if (window.PricingPreviewComponent) {
          initializePricingPreview(data);
        }

        // Set landing page link
        const landingPageLinkField = document.getElementById('landingPageLink');
        const landingPageLink = `${window.EMBED_CONFIG?.baseUrl || window.location.origin}/embed-app-v2.html?route=/affiliate-landing&code=${affiliateId}`;
        if (landingPageLinkField) landingPageLinkField.value = landingPageLink;

        console.log('Settings fields populated');
      }, 100);
    } else {
      console.error('Failed to load affiliate data:', response.status);
    }
  } catch (error) {
    console.error('Error loading settings data:', error);
  }
}

// Enable edit mode
function enableEditMode() {
  const inputs = document.querySelectorAll('#settingsForm input[type="text"], #settingsForm input[type="email"], #settingsForm input[type="tel"], #settingsForm input[type="number"]');
  inputs.forEach(input => {
    // Skip the registration link field
    if (input.id !== 'landingPageLink') {
      input.removeAttribute('readonly');
      input.classList.remove('bg-gray-100');
    }
  });

  // Enable select dropdowns
  const selects = document.querySelectorAll('#settingsForm select');
  selects.forEach(select => {
    select.removeAttribute('disabled');
    select.classList.remove('bg-gray-100');
  });

  document.getElementById('editBtn').style.display = 'none';
  document.getElementById('formButtons').style.display = 'block';

  // The pricing preview component handles its own event listeners
  // No need to add additional listeners here
}

// Disable edit mode
function disableEditMode() {
  const inputs = document.querySelectorAll('#settingsForm input[type="text"], #settingsForm input[type="email"], #settingsForm input[type="tel"], #settingsForm input[type="number"]');
  inputs.forEach(input => {
    if (input.id !== 'landingPageLink') {
      input.setAttribute('readonly', true);
      input.classList.add('bg-gray-100');
    }
  });

  // Disable select dropdowns
  const selects = document.querySelectorAll('#settingsForm select');
  selects.forEach(select => {
    select.setAttribute('disabled', true);
    select.classList.add('bg-gray-100');
  });

  document.getElementById('editBtn').style.display = 'block';
  document.getElementById('formButtons').style.display = 'none';

  // The pricing preview component handles its own event listeners
  // No need to remove listeners here
}

// Save settings
async function saveSettings(affiliateId) {
  try {
    const formData = new FormData(document.getElementById('settingsForm'));
    // Delivery fee is admin-managed (read-only here), so it is intentionally not
    // submitted from the affiliate dashboard.
    const data = {
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      businessName: formData.get('businessName')
    };

    const token = localStorage.getItem('affiliateToken');
    const result = await ApiClient.put(`/api/v1/affiliates/${affiliateId}`, data, {
      showLoading: true,
      loadingMessage: 'Updating settings...',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    alert('Settings updated successfully!');
    disableEditMode();
    loadSettingsData(affiliateId); // Reload data
  } catch (error) {
    console.error('Error saving settings:', error);
    alert('Error saving settings. Please try again.');
  }
}

// Change password function
async function changePassword(affiliateId) {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const errorDiv = document.getElementById('passwordError');
  const successDiv = document.getElementById('passwordSuccess');

  // Hide previous messages
  errorDiv.classList.add('hidden');
  successDiv.classList.add('hidden');

  // Validate passwords match
  if (newPassword !== confirmPassword) {
    errorDiv.textContent = 'New passwords do not match';
    errorDiv.classList.remove('hidden');
    return;
  }

  // Validate password length
  if (newPassword.length < 8) {
    errorDiv.textContent = 'Password must be at least 8 characters long';
    errorDiv.classList.remove('hidden');
    return;
  }

  try {
    const token = localStorage.getItem('affiliateToken');
    const result = await ApiClient.post(`/api/v1/affiliates/${affiliateId}/change-password`, {
      currentPassword: currentPassword,
      newPassword: newPassword
    }, {
      showLoading: true,
      loadingMessage: 'Changing password...',
      showError: false,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    successDiv.textContent = 'Password changed successfully!';
    successDiv.classList.remove('hidden');

    // Clear the form
    document.getElementById('changePasswordForm').reset();

    // Hide success message after 5 seconds
    setTimeout(() => {
      successDiv.classList.add('hidden');
    }, 5000);
  } catch (error) {
    console.error('Error changing password:', error);
    errorDiv.textContent = 'Error changing password. Please try again.';
    errorDiv.classList.remove('hidden');
  }
}

// Check and show delete section if enabled
function checkAndShowDeleteSection() {
  console.log('Checking environment for delete section visibility...');
  const baseUrl = window.EMBED_CONFIG?.baseUrl || window.location.origin;
  console.log('Fetching environment from:', `${baseUrl}/api/v1/environment`);

  ApiClient.get('/api/v1/environment', { showError: false })
    .then(data => {
      console.log('Environment data received:', data);
      if (data.enableDeleteDataFeature === true) {
        console.log('Delete data feature enabled, showing delete section');
        const deleteSection = document.getElementById('deleteDataSection');
        if (deleteSection) {
          deleteSection.style.display = 'block';
          console.log('Delete section made visible');
        } else {
          console.error('Delete section element not found!');
        }
      } else {
        console.log('Delete data feature not enabled, hiding delete section');
      }
    })
    .catch(error => console.error('Environment check failed:', error));
}

// Delete all data function
async function deleteAllData(affiliateId) {
  if (!confirm('Are you absolutely sure? This will delete ALL your data permanently!')) {
    return;
  }

  if (!confirm('This is your last chance to cancel. Do you really want to delete everything?')) {
    return;
  }

  try {
    const token = localStorage.getItem('affiliateToken');
    const data = await ApiClient.delete(`/api/v1/affiliates/${affiliateId}/delete-all-data`, {
      showLoading: true,
      loadingMessage: 'Deleting all data...',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (data.success) {
      alert('All data has been deleted successfully.');
      // Clear local storage and redirect to login
      localStorage.removeItem('affiliateToken');
      localStorage.removeItem('currentAffiliate');

      if (window.EMBED_CONFIG?.isEmbedded) {
        window.parent.postMessage({
          type: 'navigate',
          data: { url: '/affiliate-login' }
        }, '*');
      } else {
        window.location.href = '/embed-app-v2.html?route=/affiliate-login';
      }
    } else {
      alert(data.message || 'Failed to delete data');
    }
  } catch (error) {
    console.error('Delete error:', error);
    alert('An error occurred while deleting data');
  }
}

// ---- PR 9: vendor delivery code card ---------------------------------------
async function initDeliveryCodeCard(affiliateId) {
  const btn = document.getElementById('delivery-code-reset-btn');
  if (!btn) return;

  const token = localStorage.getItem('affiliateToken');
  const authenticatedFetch = window.CsrfUtils ? window.CsrfUtils.createAuthenticatedFetch(() => token) : fetch;
  const t = (key, fallback) => {
    if (window.i18n && typeof window.i18n.t === 'function') {
      const v = window.i18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback;
  };

  try {
    const status = await authenticatedFetch(`/api/v1/affiliates/${affiliateId}/delivery-code`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (status.ok) {
      const data = await status.json();
      if (!data.deliveryCodeSet) {
        document.getElementById('delivery-code-status').textContent = '';
      }
    }
  } catch (error) {
    // Status is informational only — the reset button still works.
  }

  btn.addEventListener('click', async () => {
    const confirmMsg = t('affiliateDashboard.deliveryCode.resetConfirm',
      'Reset your delivery code? The old code stops working immediately.');
    if (!window.confirm(confirmMsg)) return;
    const res = await authenticatedFetch(`/api/v1/affiliates/${affiliateId}/delivery-code/reset`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (res.ok) {
      const data = await res.json();
      const out = document.getElementById('delivery-code-result');
      const note = t('affiliateDashboard.deliveryCode.shownOnceNote',
        'Your new code is shown only once — store it somewhere safe:');
      out.textContent = `${note} ${data.deliveryCode}`;
      out.hidden = false;
    }
  });
}

// Initialize when DOM is ready or immediately if already ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    initializeAffiliateDashboard();
  });
} else {
  initializeAffiliateDashboard();
}