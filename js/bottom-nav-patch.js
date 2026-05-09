/* ═══════════════════════════════════════════════════════════
   ZEROday — BOTTOM NAV JS PATCH  v2
   - Shortens nav labels for the bottom bar
   - Adds body padding so content clears the nav
   Drop ONE <script> at end of <body>, after all other scripts
   ═══════════════════════════════════════════════════════════ */

(function ZDBottomNavV2() {
  'use strict';

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

  function trimLabels() {
    if (window.innerWidth <= 600) return;

    document.querySelectorAll('.nav-link').forEach(function(link) {
      // Find the text node (the label text sitting directly in the <a>)
      var textNode = null;
      link.childNodes.forEach(function(n) {
        if (n.nodeType === 3 && n.textContent.trim()) textNode = n;
      });

      // Also look for a span that's not a badge/icon
      var spanLabel = Array.from(link.querySelectorAll('span')).find(function(s) {
        return !s.classList.contains('solver-nav-badge') &&
               !s.classList.contains('notif-badge') &&
               !s.classList.contains('nav-badge') &&
               !s.classList.contains('material-symbols-outlined');
      });

      var original = (textNode ? textNode.textContent : (spanLabel ? spanLabel.textContent : '')).trim();
      var short = SHORT[original];

      if (short === '__HIDE__') {
        var li = link.closest('li');
        if (li) li.style.display = 'none';
        else link.style.display = 'none';
        return;
      }

      if (short) {
        if (textNode) textNode.textContent = short;
        else if (spanLabel) spanLabel.textContent = short;
      }
    });
  }

  function init() {
    trimLabels();
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