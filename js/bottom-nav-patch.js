/* ═══════════════════════════════════════════════════════════
   ZEROday — BOTTOM NAV JS PATCH  v3  (ALL DEVICES)

   Changes vs v2:
   - Label shortening now runs on ALL screen sizes (mobile too)
   - Removed the window.innerWidth guard so mobile also gets
     short labels in the bottom bar
   - Added ?page= query-param reader so links from solver.html
     (e.g. index.html?page=community) open the correct tab
     instead of always landing on Dashboard

   Drop ONE <script> at end of <body>, after all other scripts
   ═══════════════════════════════════════════════════════════ */

(function ZDBottomNavV3() {
  'use strict';

  /* ── Short labels for each nav item ──────────────────── */
  var SHORT = {
    'Dashboard':     'Home',
    'Community':     'Social',
    'Notifications': 'Alerts',
    'White Noise':   'Noise',
    'Settings':      'Settings',
    'Admin Panel':   'Admin',
    'JEE Solver':    'Solver',
    'Sign Out':      '__HIDE__'
  };

  /* ── Shorten text labels ────────────────────────────── */
  function trimLabels() {
    document.querySelectorAll('.nav-link').forEach(function(link) {
      // Find raw text node inside the <a>
      var textNode = null;
      link.childNodes.forEach(function(n) {
        if (n.nodeType === 3 && n.textContent.trim()) textNode = n;
      });

      // Also look for a label <span> (not a badge/icon span)
      var spanLabel = Array.from(link.querySelectorAll('span')).find(function(s) {
        return !s.classList.contains('solver-nav-badge') &&
               !s.classList.contains('notif-badge') &&
               !s.classList.contains('nav-badge') &&
               !s.classList.contains('material-symbols-outlined');
      });

      var original = (textNode ? textNode.textContent : (spanLabel ? spanLabel.textContent : '')).trim();
      var short    = SHORT[original];

      if (short === '__HIDE__') {
        var li = link.closest('li');
        if (li) li.style.display = 'none';
        else     link.style.display = 'none';
        return;
      }

      if (short) {
        if (textNode)   textNode.textContent   = short;
        else if (spanLabel) spanLabel.textContent = short;
      }
    });
  }

  /* ── Read ?page=xxx URL param and navigate to that tab ─
     This fixes the bug where clicking Community / White Noise /
     Settings on solver.html always landed on Dashboard.
     Nav links on solver.html should use:
       href="index.html?page=community"
       href="index.html?page=whitenoise"
       href="index.html?page=settings"
     index.html will then route to the correct page after login.
  ──────────────────────────────────────────────────────── */
  function handlePageParam() {
    var params = new URLSearchParams(window.location.search);
    var page   = params.get('page');
    if (!page) return;

    // Clean the URL so refreshing doesn't re-trigger routing
    var cleanUrl = window.location.pathname;
    try { history.replaceState(null, '', cleanUrl); } catch(e) {}

    // goToPage is defined in app.js — wait until it is available,
    // then call it. We poll briefly to handle script-load order.
    var attempts = 0;
    var maxAttempts = 40; // 40 × 100ms = 4 s max wait
    var timer = setInterval(function() {
      attempts++;
      if (typeof goToPage === 'function') {
        clearInterval(timer);
        goToPage(page);
      } else if (attempts >= maxAttempts) {
        clearInterval(timer);
      }
    }, 100);
  }

  /* ── Init ───────────────────────────────────────────── */
  function init() {
    trimLabels();
    handlePageParam();

    // Watch for dynamically inserted links (e.g. solver patch)
    var nav = document.querySelector('.nav-links');
    if (nav && window.MutationObserver) {
      new MutationObserver(trimLabels).observe(nav, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
