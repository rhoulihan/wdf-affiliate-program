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
    } else if (tabId === 'earnings') {
      loadEarnings(affiliateId);
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
    
  // Translation is driven by i18n.translatePage(); this page previously carried a
  // debug routine that dumped the whole translation table to the console and
  // rejected any translation containing a period.

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


  // Filter, search and paging controls. These existed in the markup with no
  // listeners at all, so the server-side filtering they imply was unreachable.
  const reloadOrders = () => { ordersPage = 1; loadPickupRequests(affiliateId); };
  const reloadCustomers = () => { customersPage = 1; loadCustomersWithHighlight(affiliateId); };
  document.getElementById('orderStatusFilter')?.addEventListener('change', reloadOrders);
  document.getElementById('dateFilter')?.addEventListener('change', reloadOrders);
  document.getElementById('orderSearch')?.addEventListener('change', reloadOrders);
  document.getElementById('customerSearch')?.addEventListener('change', reloadCustomers);
  document.getElementById('customerSort')?.addEventListener('change', reloadCustomers);

  const page = (variable, delta, reload) => () => {
    const next = variable() + delta;
    if (next >= 1) reload(next);
  };
  document.getElementById('prevOrdersPage')?.addEventListener('click',
    page(() => ordersPage, -1, n => { ordersPage = n; loadPickupRequests(affiliateId); }));
  document.getElementById('nextOrdersPage')?.addEventListener('click',
    page(() => ordersPage, 1, n => { ordersPage = n; loadPickupRequests(affiliateId); }));
  document.getElementById('prevCustomersPage')?.addEventListener('click',
    page(() => customersPage, -1, n => { customersPage = n; loadCustomersWithHighlight(affiliateId); }));
  document.getElementById('nextCustomersPage')?.addEventListener('click',
    page(() => customersPage, 1, n => { customersPage = n; loadCustomersWithHighlight(affiliateId); }));

  // Make functions available globally (they're used by the existing dashboard code)
  window.loadAffiliateData = loadAffiliateData;
  window.loadDashboardStats = loadDashboardStats;
  window.loadPickupRequests = loadPickupRequests;
  window.loadCustomers = loadCustomers;
  window.loadSettingsData = loadSettingsData;
  window.loadEarnings = loadEarnings;
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

      // #monthlyRevenue and #pendingPayment do not exist on this page — those writes
      // were null-guarded and silently did nothing. These are the elements that do.
      const set = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };
      set('monthEarnings', formatMoney(stats.monthEarnings));
      set('weekEarnings', formatMoney(stats.weekEarnings));
      set('monthOrderCount', String(stats.monthlyOrders ?? 0));
      set('weekOrderCount', String(stats.weeklyOrders ?? 0));
    }
  } catch (error) {
    console.error('Error loading dashboard stats:', error);
  }
}

// The five states of the order machine, each with its badge class and i18n key. The
// previous renderer hard-coded six statuses the model rejects, printed the raw value
// with underscores swapped for spaces (so every badge showed untranslated lowercase
// English), and gave two of the five real states no colour at all.
const ORDER_STATUS_META = {
  pending: { badge: 'bg-gray-100 text-gray-800', key: 'orders.status.pending', fallback: 'Awaiting intake' },
  in_progress: { badge: 'bg-blue-100 text-blue-800', key: 'orders.status.inProgress', fallback: 'In progress' },
  out_for_delivery: { badge: 'bg-yellow-100 text-yellow-800', key: 'orders.status.outForDelivery', fallback: 'Out for delivery' },
  complete: { badge: 'bg-green-100 text-green-800', key: 'orders.status.complete', fallback: 'Complete' },
  cancelled: { badge: 'bg-red-100 text-red-800', key: 'orders.status.cancelled', fallback: 'Cancelled' }
};

let ordersPage = 1;
let customersPage = 1;

function tr(key, fallback) {
  return (window.i18n?.t ? window.i18n.t(key) || fallback : fallback);
}

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function statusBadge(status) {
  const meta = ORDER_STATUS_META[status];
  const badge = meta ? meta.badge : 'bg-gray-100 text-gray-800';
  const label = meta ? tr(meta.key, meta.fallback) : status;
  return `<span class="px-2 py-1 rounded text-xs ${badge}">${escapeHtml(label)}</span>`;
}

function formatDate(value) {
  if (!value) return '\u2014';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '\u2014' : d.toLocaleDateString();
}

function formatMoney(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '\u2014';
}

/** Fill the "showing X of Y" counters, which nothing ever wrote to. */
function updatePaginationText(prefix, shown, pagination) {
  const showing = document.getElementById(`${prefix}Showing`);
  const total = document.getElementById(`${prefix}Total`);
  if (showing) showing.textContent = String(shown);
  if (total) total.textContent = String(pagination?.total ?? shown);
}

async function loadPickupRequests(affiliateId) {
  const tbody = document.getElementById('ordersTableBody');
  try {
    const token = localStorage.getItem('affiliateToken');
    // The status, date and search controls were inert: the request carried no query
    // string, so the server-side filtering already implemented here was unreachable
    // and the selected option had no effect on what came back.
    const params = new URLSearchParams();
    const status = document.getElementById('orderStatusFilter')?.value;
    const date = document.getElementById('dateFilter')?.value;
    const search = document.getElementById('orderSearch')?.value;
    if (status && status !== 'all') params.set('status', status);
    if (date && date !== 'all') params.set('date', date);
    if (search && search.trim()) params.set('search', search.trim());
    params.set('page', String(ordersPage));

    const data = await ApiClient.get(
      `/api/v1/affiliates/${affiliateId}/orders?${params.toString()}`,
      { showError: false, headers: { 'Authorization': `Bearer ${token}` } });
    if (!data || !tbody) return;

    const orders = data.orders || [];
    tbody.innerHTML = '';

    if (orders.length === 0) {
      // 7 columns: Order ID, Customer, Address, Bag, Created, Status, Your Fee.
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-gray-500">${
        escapeHtml(tr('affiliate.dashboard.messages.noOrders', 'No orders found'))}</td></tr>`;
    } else {
      orders.forEach(order => {
        const row = document.createElement('tr');
        row.className = 'border-b hover:bg-gray-50';
        row.innerHTML = `
          <td class="py-3 px-4">${escapeHtml(order.orderId)}</td>
          <td class="py-3 px-4">${escapeHtml(order.customer?.name || '\u2014')}</td>
          <td class="py-3 px-4">${escapeHtml(order.customer?.address || '\u2014')}</td>
          <td class="py-3 px-4">${escapeHtml(order.bagId || '\u2014')}</td>
          <td class="py-3 px-4">${escapeHtml(formatDate(order.createdAt))}</td>
          <td class="py-3 px-4">${statusBadge(order.status)}</td>
          <td class="py-3 px-4">${escapeHtml(formatMoney(order.deliveryFeeCharged))}</td>
        `;
        tbody.appendChild(row);
      });
    }
    updatePaginationText('orders', orders.length, data.pagination);
  } catch (error) {
    console.error('Error loading pickup requests:', error);
  }
}

async function loadCustomers(affiliateId) {
  await loadCustomersWithHighlight(affiliateId, null);
}

async function loadCustomersWithHighlight(affiliateId, highlightCustomerId) {
  const tbody = document.getElementById('customersTableBody');
  try {
    const token = localStorage.getItem('affiliateToken');
    // Search and sort were inert here too — the controller implements both and the
    // client sent neither.
    const params = new URLSearchParams();
    const search = document.getElementById('customerSearch')?.value;
    const sort = document.getElementById('customerSort')?.value;
    if (search && search.trim()) params.set('search', search.trim());
    if (sort) params.set('sort', sort);
    params.set('page', String(customersPage));

    const data = await ApiClient.get(
      `/api/v1/affiliates/${affiliateId}/customers?${params.toString()}`,
      { showError: false, headers: { 'Authorization': `Bearer ${token}` } });
    if (!data || !tbody) return;

    const customers = data.customers || [];
    tbody.innerHTML = '';

    if (customers.length === 0) {
      // 6 columns: Customer ID, Name, Contact Info, Address, Registered, Orders.
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-gray-500">${
        escapeHtml(tr('affiliate.dashboard.messages.noCustomers', 'No customers found'))}</td></tr>`;
    } else {
      customers.forEach(customer => {
        const highlighted = highlightCustomerId && customer.customerId === highlightCustomerId;
        const row = document.createElement('tr');
        row.className = `border-b ${highlighted ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'}`;
        if (highlighted) row.id = `customer-${customer.customerId}`;
        // customerId, registrationDate and orderCount are all returned by the server
        // and were thrown away. The previous renderer also showed an Active/Inactive
        // badge built from `isActive`, a field this projection does not include, so
        // every customer always read "Active".
        const newBadge = highlighted
          ? ` <span class="text-xs text-blue-600">${escapeHtml(tr('affiliate.dashboard.messages.newRegistration', '(New Registration)'))}</span>`
          : '';
        const star = highlighted ? '<span class="font-bold text-blue-800">&#9733; </span>' : '';
        const name = customer.name || `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
        row.innerHTML = `
          <td class="py-3 px-4">${escapeHtml(customer.customerId)}</td>
          <td class="py-3 px-4">${star}${escapeHtml(name)}${newBadge}</td>
          <td class="py-3 px-4">${escapeHtml(customer.email || '\u2014')}<br><span class="text-sm text-gray-500">${escapeHtml(customer.phone || '')}</span></td>
          <td class="py-3 px-4">${escapeHtml(customer.fullAddress || '\u2014')}</td>
          <td class="py-3 px-4">${escapeHtml(customer.registrationDate || '\u2014')}</td>
          <td class="py-3 px-4">${escapeHtml(String(customer.orderCount ?? 0))}</td>
        `;
        tbody.appendChild(row);
      });
      if (highlightCustomerId) {
        const target = document.getElementById(`customer-${highlightCustomerId}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    updatePaginationText('customers', customers.length, data.pagination);
  } catch (error) {
    console.error('Error loading customers:', error);
  }
}

/**
 * The Earnings tab had no JS at all — no branch in switchToTab and not one element
 * written, so it showed $0.00 and a permanent "Loading transactions..." row.
 *
 * It is rebuilt from the two endpoints that already exist. GET /:id/earnings defaults
 * to all-time and returns the partner's own delivery-fee total plus the completed
 * orders behind it, which is what "Total Earnings" in the header should say; the
 * dashboard-stats endpoint supplies the month and week figures.
 */
async function loadEarnings(affiliateId) {
  const tbody = document.getElementById('transactionsTableBody');
  try {
    const token = localStorage.getItem('affiliateToken');
    const data = await ApiClient.get(`/api/v1/affiliates/${affiliateId}/earnings`, {
      showError: false, headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!data) return;

    const total = document.getElementById('totalEarnings');
    if (total) total.textContent = formatMoney(data.totalEarnings);

    if (!tbody) return;
    const rows = data.orders || [];
    tbody.innerHTML = '';
    if (rows.length === 0) {
      // 4 columns: Date, Order ID, Customer, Your Fee.
      tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-4 text-gray-500">${
        escapeHtml(tr('affiliate.dashboard.messages.noTransactions', 'No completed orders yet'))}</td></tr>`;
      return;
    }
    rows.forEach(row => {
      const el = document.createElement('tr');
      el.className = 'border-b hover:bg-gray-50';
      el.innerHTML = `
        <td class="px-6 py-4">${escapeHtml(formatDate(row.completedAt))}</td>
        <td class="px-6 py-4">${escapeHtml(row.orderId)}</td>
        <td class="px-6 py-4">${escapeHtml(row.customerName || '\u2014')}</td>
        <td class="px-6 py-4">${escapeHtml(formatMoney(row.commission))}</td>
      `;
      tbody.appendChild(el);
    });
  } catch (error) {
    console.error('Error loading earnings:', error);
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
    const token = localStorage.getItem('affiliateToken');
    const result = await ApiClient.get(`/api/v1/affiliates/${affiliateId}`, {
      showError: false,
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!result) return;

    const data = result.affiliate || result;

    // Bind to the RAW values, never the display-formatted ones. `address` and
    // `phone` come back formatted for display; writing those back on save would
    // store the formatting and degrade the field a little more every time.
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value === undefined || value === null ? '' : value;
    };
    const setChecked = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.checked = Boolean(value);
    };

    setValue('settingsFirstName', data.firstName);
    setValue('settingsLastName', data.lastName);
    setValue('settingsEmail', data.email);
    setValue('settingsPhone', data.phoneRaw ?? data.phone);
    setValue('settingsBusinessName', data.businessName);
    setValue('settingsAddress', data.addressLine);
    setValue('settingsCity', data.city);
    setValue('settingsState', data.state);
    setValue('settingsZipCode', data.zipCode);
    setValue('settingsServiceType', data.serviceType || 'pickup_location');
    setValue('settingsPickupInstructions', data.pickupInstructions);
    setValue('settingsDeliveryInstructions', data.deliveryInstructions);
    setValue('settingsGeoRadiusMiles', data.geoRadiusMiles);
    setValue('settingsLanguagePreference', data.languagePreference || 'en');
    setValue('settingsDeliveryFee', parseFloat(data.deliveryFee) || 0);
    setChecked('settingsGeoValidationEnabled', data.geoValidationEnabled);
    setChecked('settingsOrderNotificationsEnabled', data.orderNotificationsEnabled);

    // Partner type is an admin decision — shown, never editable.
    const typeField = document.getElementById('settingsAffiliateType');
    if (typeField) {
      const key = data.affiliateType === 'location'
        ? 'affiliate.dashboard.settings.affiliateTypeLocation'
        : 'affiliate.dashboard.settings.affiliateTypeStandard';
      const fallback = data.affiliateType === 'location' ? 'Pickup location' : 'Standard partner';
      typeField.value = window.i18n?.t ? window.i18n.t(key) || fallback : fallback;
    }

    if (window.PricingPreviewComponent) initializePricingPreview(data);

    const landingPageLinkField = document.getElementById('landingPageLink');
    if (landingPageLinkField) {
      landingPageLinkField.value = `${window.EMBED_CONFIG?.baseUrl || window.location.origin}` +
        `/embed-app-v2.html?route=/affiliate-landing&code=${affiliateId}`;
    }
  } catch (error) {
    console.error('Error loading settings data:', error);
  }
}

// Fields the affiliate may never edit here: the landing-page link is generated,
// and partner type is an administrator's decision.
const SETTINGS_LOCKED_IDS = ['landingPageLink', 'settingsAffiliateType'];

function setSettingsEditable(editable) {
  const selector = '#settingsForm input, #settingsForm select, #settingsForm textarea';
  document.querySelectorAll(selector).forEach(el => {
    if (SETTINGS_LOCKED_IDS.includes(el.id) || el.type === 'hidden') return;
    // Some controls were shipped `disabled` and others `readonly`; clearing only
    // readonly left the delivery fee looking editable while refusing input.
    if (editable) {
      el.removeAttribute('readonly');
      el.removeAttribute('disabled');
      el.classList.remove('bg-gray-100');
    } else {
      if (el.tagName === 'SELECT' || el.type === 'checkbox') {
        el.setAttribute('disabled', true);
      } else {
        el.setAttribute('readonly', true);
      }
      el.classList.add('bg-gray-100');
    }
  });

  const editBtn = document.getElementById('editBtn');
  const formButtons = document.getElementById('formButtons');
  if (editBtn) editBtn.style.display = editable ? 'none' : 'block';
  if (formButtons) formButtons.style.display = editable ? 'block' : 'none';
}

function enableEditMode() { setSettingsEditable(true); }
function disableEditMode() { setSettingsEditable(false); }

// Save settings
async function saveSettings(affiliateId) {
  const t = (key, fallback) => (window.i18n?.t ? window.i18n.t(key) || fallback : fallback);
  try {
    const value = id => document.getElementById(id)?.value;
    const checked = id => Boolean(document.getElementById(id)?.checked);

    // Send exactly what the affiliate owns. The server rejects unknown keys with a
    // 400 naming them, so a stray field here is loud instead of being dropped in
    // silence — which is what used to happen to the email field.
    const data = {
      firstName: value('settingsFirstName'),
      lastName: value('settingsLastName'),
      email: value('settingsEmail'),
      phone: value('settingsPhone'),
      businessName: value('settingsBusinessName'),
      address: value('settingsAddress'),
      city: value('settingsCity'),
      state: value('settingsState'),
      zipCode: value('settingsZipCode'),
      serviceType: value('settingsServiceType'),
      deliveryInstructions: value('settingsDeliveryInstructions'),
      languagePreference: value('settingsLanguagePreference'),
      deliveryFee: parseFloat(value('settingsDeliveryFee')),
      paymentMethod: value('settingsPaymentMethod'),
      geoValidationEnabled: checked('settingsGeoValidationEnabled'),
      orderNotificationsEnabled: checked('settingsOrderNotificationsEnabled')
    };

    // The server writes only the handle matching the chosen method.
    const method = value('settingsPaymentMethod');
    if (method === 'paypal') {
      const pp = value('settingsPaypalEmail');
      if (pp && pp.trim()) data.paypalEmail = pp.trim();
    } else if (method === 'venmo') {
      const vh = value('settingsVenmoHandle');
      if (vh && vh.trim()) data.venmoHandle = vh.trim();
    }

    // Optional-but-validated fields: send them only when they carry a value.
    // pickupInstructions may not be blanked once set, and an empty geoRadiusMiles
    // would fail the numeric range check.
    const pickup = value('settingsPickupInstructions');
    if (pickup && pickup.trim()) data.pickupInstructions = pickup.trim();
    const radius = value('settingsGeoRadiusMiles');
    if (radius !== undefined && radius !== '') data.geoRadiusMiles = parseFloat(radius);

    const token = localStorage.getItem('affiliateToken');
    await ApiClient.put(`/api/v1/affiliates/${affiliateId}`, data, {
      showLoading: true,
      loadingMessage: t('affiliate.dashboard.settings.saving', 'Updating settings...'),
      headers: { 'Authorization': `Bearer ${token}` }
    });

    alert(t('affiliate.dashboard.settings.savedOk', 'Settings updated successfully!'));
    disableEditMode();
    loadSettingsData(affiliateId);
  } catch (error) {
    console.error('Error saving settings:', error);
    // Surface what the server objected to — validation errors name the field.
    const detail = error?.response?.data?.message || error?.message;
    alert(detail || t('affiliate.dashboard.settings.saveFailed', 'Error saving settings. Please try again.'));
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
    // PUT /:affiliateId, not POST /change-password — the latter route has never
    // existed on the affiliate router, so this form always fell into its catch and
    // told the user "Error changing password" no matter what they typed. The PUT
    // handler takes currentPassword + newPassword and verifies the old one.
    const result = await ApiClient.put(`/api/v1/affiliates/${affiliateId}`, {
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