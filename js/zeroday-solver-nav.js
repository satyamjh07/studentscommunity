/* ═══════════════════════════════════════════════════════
   ZEROday — Solver Nav Patch
   Drop this ONE script tag at the end of index.html
   (after all other scripts) and it will:
   1. Add a "JEE Solver" item to the sidebar nav
   2. Add a "Solver" shortcut to the mobile quick-actions
   3. Inject the solver score pill into the topbar area
   No changes to index.html internals needed.
   ═══════════════════════════════════════════════════════ */

(function ZDSolverNavPatch() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    _addSidebarLink();
    _addDashboardCard();
    _injectStyles();
  });

  // ── 1. Add "JEE Solver" to sidebar nav ────────────────
  function _addSidebarLink() {
    var navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    // Build the new <li>
    var li = document.createElement('li');
    li.innerHTML = [
      '<a href="solver.html" class="nav-link nav-link-solver" id="nav-solver-link">',
        '<svg class="nav-svg" width="17" height="17" viewBox="0 0 24 24"',
          ' fill="none" stroke="currentColor" stroke-width="1.8"',
          ' stroke-linecap="round" stroke-linejoin="round">',
          '<polygon points="12 2 2 7 12 12 22 7 12 2"/>',
          '<polyline points="2 17 12 22 22 17"/>',
          '<polyline points="2 12 12 17 22 12"/>',
        '</svg>',
        'JEE Solver',
        '<span class="solver-nav-badge">New</span>',
      '</a>',
    ].join('');

    // Insert before the Settings nav item so it sits in the middle
    var settingsLi = navLinks.querySelector('[data-page="settings"]');
    settingsLi = settingsLi ? settingsLi.closest('li') : null;
    if (settingsLi) {
      navLinks.insertBefore(li, settingsLi);
    } else {
      navLinks.appendChild(li);
    }
  }

  // ── 2. Add solver card to dashboard quick-actions ──────
  function _addDashboardCard() {
    var qaCard = document.querySelector('.quick-actions-card');
    if (!qaCard) return;

    var btn = document.createElement('button');
    btn.className = 'qa-btn solver-qa-btn';
    btn.innerHTML = [
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"',
        ' stroke="currentColor" stroke-width="1.8"',
        ' stroke-linecap="round" stroke-linejoin="round">',
        '<polygon points="12 2 2 7 12 12 22 7 12 2"/>',
        '<polyline points="2 17 12 22 22 17"/>',
        '<polyline points="2 12 12 17 22 12"/>',
      '</svg>',
      ' Solve PYQs',
    ].join('');
    btn.addEventListener('click', function () {
      window.location.href = 'solver.html';
    });

    qaCard.appendChild(btn);
  }

  // ── 3. Inject minimal CSS for the new elements ────────
  function _injectStyles() {
    if (document.getElementById('zd-solver-nav-styles')) return;
    var style = document.createElement('style');
    style.id = 'zd-solver-nav-styles';
    style.textContent = [
      /* "New" badge on the nav link */
      '.solver-nav-badge {',
        'display: inline-block;',
        'margin-left: auto;',
        'font-size: 0.58rem;',
        'font-weight: 800;',
        'text-transform: uppercase;',
        'letter-spacing: 0.07em;',
        'padding: 0.1rem 0.45rem;',
        'border-radius: 99px;',
        'background: var(--accent);',
        'color: #fff;',
        'line-height: 1.6;',
        'opacity: 0.92;',
      '}',

      /* Subtle accent tint on hover for the solver link */
      '.nav-link-solver:hover,',
      '.nav-link-solver.active {',
        'color: var(--accent) !important;',
      '}',

      /* Quick-action button for solver */
      '.solver-qa-btn {',
        'background: rgba(var(--accent-rgb, 124,111,255), 0.07) !important;',
        'border-color: rgba(var(--accent-rgb, 124,111,255), 0.2) !important;',
        'color: var(--accent) !important;',
      '}',
      '.solver-qa-btn:hover {',
        'background: rgba(var(--accent-rgb, 124,111,255), 0.14) !important;',
      '}',
    ].join('\n');

    document.head.appendChild(style);
  }

})();