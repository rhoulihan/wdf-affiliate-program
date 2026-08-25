// Affiliate success page functionality for embedded environment
function initializeAffiliateSuccess() {
  const isEmbedded = window.EMBED_CONFIG?.isEmbedded || false;
  const baseUrl = window.EMBED_CONFIG?.baseUrl || window.location.origin;

  // PostMessage communication with parent window
  function sendMessageToParent(type, data) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: type,
        source: 'wavemax-embed',
        data: data
      }, '*');
    }
  }

  // Navigate parent frame
  window.navigateParent = function(page) {
    if (isEmbedded) {
      // For embed-app, use the navigate message
      window.parent.postMessage({
        type: 'navigate',
        data: { url: `/${page}` }
      }, '*');
    } else {
      sendMessageToParent('navigate', { page: page });
    }
  };

  // Generic copy functionality
  function copyToClipboard(inputId, buttonId, messageType) {
    const linkInput = document.getElementById(inputId);
    const btn = document.getElementById(buttonId);

    // Method 1: Try selecting the input directly first
    try {
      linkInput.select();
      linkInput.setSelectionRange(0, 99999);

      const successful = document.execCommand('copy');

      if (successful) {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('bg-green-600');
        btn.classList.remove('bg-blue-600');

        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('bg-green-600');
          btn.classList.add('bg-blue-600');
        }, 2000);

        sendMessageToParent(messageType, { link: linkInput.value });
        return;
      }
    } catch (err) {
      console.log('Direct copy failed, trying textarea method');
    }

    // Method 2: Fallback to textarea method
    const tempTextarea = document.createElement('textarea');
    tempTextarea.value = linkInput.value;
    tempTextarea.style.position = 'fixed';
    tempTextarea.style.top = '0';
    tempTextarea.style.left = '0';
    tempTextarea.style.width = '2em';
    tempTextarea.style.height = '2em';
    tempTextarea.style.padding = '0';
    tempTextarea.style.border = 'none';
    tempTextarea.style.outline = 'none';
    tempTextarea.style.boxShadow = 'none';
    tempTextarea.style.background = 'transparent';

    document.body.appendChild(tempTextarea);

    try {
      tempTextarea.focus();
      tempTextarea.select();

      const successful = document.execCommand('copy');
      document.body.removeChild(tempTextarea);

      if (successful) {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('bg-green-600');
        btn.classList.remove('bg-blue-600');

        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('bg-green-600');
          btn.classList.add('bg-blue-600');
        }, 2000);

        sendMessageToParent(messageType, { link: linkInput.value });
      } else {
        throw new Error('Copy command failed');
      }
    } catch (err) {
      document.body.removeChild(tempTextarea);
      console.error('Failed to copy link:', err);
      // Fallback: select the input for manual copying
      linkInput.select();
      linkInput.focus();
      alert('Please press Ctrl+C (or Cmd+C on Mac) to copy the link.');
    }
  }

  // Copy landing page link functionality
  window.copyLandingPageLink = function() {
    copyToClipboard('landingPageLink', 'copyLandingLinkBtn', 'landing-link-copied');
  };

  // Load affiliate information
  function loadAffiliateInfo() {
    // Try to get affiliate info from localStorage
    const affiliate = localStorage.getItem('currentAffiliate');

    if (affiliate) {
      try {
        const affiliateData = JSON.parse(affiliate);

        // Display affiliate information
        document.getElementById('affiliateId').textContent = affiliateData.affiliateId;
        document.getElementById('affiliateName').textContent =
                    `${affiliateData.firstName} ${affiliateData.lastName}`;
        document.getElementById('affiliateEmail').textContent = affiliateData.email;

        // Generate landing page link
        const landingPageLink = `${window.EMBED_CONFIG?.baseUrl || window.location.origin}/embed-app-v2.html?route=/affiliate-landing&code=${affiliateData.affiliateId}`;
        const landingPageInput = document.getElementById('landingPageLink');
        if (landingPageInput) {
          landingPageInput.value = landingPageLink;
        }

        // Update dashboard link to go to login
        const dashboardLink = document.getElementById('dashboardLink');
        if (dashboardLink) {
          dashboardLink.onclick = function(e) {
            e.preventDefault();
            console.log('Dashboard button clicked - redirecting to login');

            if (isEmbedded && window.parent && window.parent !== window) {
              console.log('Sending navigation message to parent');

              // Try multiple parent levels in case of nested iframes
              let targetWindow = window.parent;
              let attempts = 0;

              while (targetWindow && attempts < 5) {
                console.log(`Attempting to send message to parent level ${attempts + 1}`);
                targetWindow.postMessage({
                  type: 'navigate',
                  data: { url: '/affiliate-login' }
                }, '*');

                if (targetWindow.parent && targetWindow.parent !== targetWindow) {
                  targetWindow = targetWindow.parent;
                  attempts++;
                } else {
                  break;
                }
              }

              // Also try direct navigation as ultimate fallback
              setTimeout(() => {
                if (window.location.href.includes('affiliate-success')) {
                  console.log('Fallback: Direct navigation to login');
                  window.location.href = '/embed-app-v2.html?route=/affiliate-login&login=affiliate';
                }
              }, 1000);
            } else {
              window.location.href = '/embed-app-v2.html?route=/affiliate-login&login=affiliate';
            }
            return false;
          };
        }

        // Set up copy button event listener for landing page link
        const copyLandingBtn = document.getElementById('copyLandingLinkBtn');
        if (copyLandingBtn) {
          copyLandingBtn.onclick = function(e) {
            e.preventDefault();
            window.copyLandingPageLink();
            return false;
          };
        }

        // Notify parent of successful registration
        sendMessageToParent('registration-complete', {
          affiliateId: affiliateData.affiliateId
        });
      } catch (e) {
        console.error('Error parsing affiliate data:', e);
        // Show fallback content
        showFallbackContent();
      }
    } else {
      // Show fallback content if no affiliate data
      showFallbackContent();
    }

    // Notify parent that iframe is loaded
    sendMessageToParent('iframe-loaded', { page: 'affiliate-success' });
  }

  function showFallbackContent() {
    document.getElementById('affiliateId').textContent = 'Your unique ID will be provided shortly';
    document.getElementById('affiliateName').textContent = 'Your information is being processed';
    document.getElementById('affiliateEmail').textContent = 'Check your email for confirmation';
  }

  // Initialize when DOM is ready or immediately if already ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAffiliateInfo);
  } else {
    loadAffiliateInfo();
  }
}

// Initialize immediately
initializeAffiliateSuccess();