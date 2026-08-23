// /scanbag — standalone mobile PWA: scan a bag QR with the phone camera and
// hand off to the existing /claim flow (which starts or completes the order).
// Android primary (native BarcodeDetector); iOS fallback (jsQR). CSP-clean.
(function () {
  'use strict';

  var video = document.getElementById('scanbag-video');
  var statusEl = document.getElementById('scanbag-status');
  var startBtn = document.getElementById('scanbag-start');
  var installBtn = document.getElementById('scanbag-install');
  var iosHint = document.getElementById('scanbag-ios-hint');

  var stream = null;
  var scanning = false;
  var redirected = false;
  var detector = null;
  var canvas = null;
  var ctx = null;
  var rafId = null;
  var lastScan = 0;

  function setStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = 'scanbag-status' + (type ? ' ' + type : '');
  }

  // A bag QR encodes the claim URL (…?route=/claim&bag=<32-hex>). Extract and
  // VALIDATE the token; the destination is built locally → never an open redirect.
  var HEX32 = /^[a-f0-9]{32}$/i;
  function tokenFromQr(text) {
    if (!text) return null;
    text = String(text).trim();
    if (HEX32.test(text)) return text.toLowerCase();
    try {
      var u = new URL(text, window.location.origin);
      var bag = u.searchParams.get('bag');
      if (bag && HEX32.test(bag)) return bag.toLowerCase();
    } catch (e) { /* not a URL */ }
    var m = text.match(/[?&]bag=([a-f0-9]{32})/i);
    return m ? m[1].toLowerCase() : null;
  }

  function stopCamera() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  }

  function go(token) {
    if (redirected) return;
    redirected = true;
    scanning = false;
    stopCamera();
    setStatus('Bag found — opening…', 'success');
    window.location.href = '/embed-app-v2.html?route=/claim&bag=' + token;
  }

  function handleDecoded(text) {
    var token = tokenFromQr(text);
    if (token) { go(token); return; }
    setStatus('That QR isn’t a ' + ((window.BRAND && window.BRAND.name) || 'Laundromat') + ' bag. Keep scanning…', 'error');
  }

  function scanLoop() {
    if (!scanning || redirected) return;
    var now = Date.now();
    if (now - lastScan >= 180 && video.readyState >= 2 && video.videoWidth) {
      lastScan = now;
      if (detector) {
        detector.detect(video).then(function (codes) {
          if (codes && codes.length) handleDecoded(codes[0].rawValue);
        }).catch(function () { /* transient detect error — keep scanning */ });
      } else if (window.jsQR) {
        if (!canvas) {
          canvas = document.createElement('canvas');
          ctx = canvas.getContext('2d', { willReadFrequently: true });
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var res = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (res && res.data) handleDecoded(res.data);
      }
    }
    rafId = requestAnimationFrame(scanLoop);
  }

  function beginDetector() {
    if (!('BarcodeDetector' in window)) return Promise.resolve();
    return window.BarcodeDetector.getSupportedFormats().then(function (fmts) {
      if (fmts.indexOf('qr_code') !== -1) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    }).catch(function () { detector = null; });
  }

  function startCamera() {
    startBtn.hidden = true;
    setStatus('Starting camera…');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('This device or browser can’t access the camera.', 'error');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(function (s) {
        stream = s;
        video.srcObject = s;
        return video.play();
      })
      .then(beginDetector)
      .then(function () {
        scanning = true;
        redirected = false;
        setStatus('Point at the bag’s QR code.');
        rafId = requestAnimationFrame(scanLoop);
      })
      .catch(function (err) {
        if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
          setStatus('Camera permission denied. Allow it, then tap below.', 'error');
          startBtn.textContent = 'Enable camera';
          startBtn.hidden = false;
        } else if (err && err.name === 'NotFoundError') {
          setStatus('No camera found on this device.', 'error');
        } else {
          setStatus('Could not start the camera. Tap to retry.', 'error');
          startBtn.hidden = false;
        }
      });
  }

  startBtn.addEventListener('click', startCamera);

  // Release/re-acquire the camera with tab/app visibility.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stopCamera(); scanning = false; }
    else if (!redirected && !stream) { startCamera(); }
  });

  // ---- PWA install (Android: beforeinstallprompt → our button) -------------
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () {}).catch(function () {}).then(function () {
      deferredPrompt = null;
      installBtn.hidden = true;
    });
  });
  window.addEventListener('appinstalled', function () { installBtn.hidden = true; });

  // iOS Safari has no beforeinstallprompt — show the manual Add-to-Home-Screen
  // hint (only when not already installed and no native prompt is available).
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var standalone = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  if (isIOS && !standalone) {
    setTimeout(function () { if (!deferredPrompt) iosHint.hidden = false; }, 1200);
  }

  // Register the SW (required for installability), scoped to /scanbag so it
  // never controls or caches the main app.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/scanbag-sw.js', { scope: '/scanbag' })
      .catch(function () { /* install still works without it on most browsers */ });
  }

  startCamera();
})();
