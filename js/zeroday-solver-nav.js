/* ═══════════════════════════════════════════════════════
   ZEROday — Solver Nav Patch  (v2 — Kinetic Zero)
   Drop this ONE script tag at the end of index.html
   (after all other scripts). It will:
   1. Add "JEE SOLVER" to the sidebar nav
   2. Add a "Solve PYQs" button to the quick-actions card
   No changes to index.html internals needed.
   ═══════════════════════════════════════════════════════ */

(function ZDSolverNavPatch() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    _addSidebarLink();
    _addDashboardCard();
    _injectStyles();
  });

  // ── 1. Add "JEE SOLVER" to sidebar nav ────────────────
  function _addSidebarLink() {
    // Works for both old sidebar (.nav-links li a) and new Kinetic Zero sidebar (.zd-nav a)
    var navLinks = document.querySelector('.nav-links, .zd-nav');
    if (!navLinks) return;

    var li = document.createElement(navLinks.tagName === 'UL' ? 'li' : 'div');
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

    // For Kinetic Zero sidebar, insert as a plain <a>
    var zdNav = document.querySelector('.zd-nav');
    if (zdNav) {
      var a = document.createElement('a');
      a.href = 'solver.html';
      a.className = 'zd-nav-link zd-nav-link-solver';
      a.id = 'nav-solver-link';
      a.innerHTML =
        '<span class="material-symbols-outlined">layers</span>' +
        'JEE SOLVER' +
        '<span class="solver-nav-badge">New</span>';
      // Insert before Settings if present
      var settingsLink = zdNav.querySelector('[href*="settings"]');
      if (settingsLink) zdNav.insertBefore(a, settingsLink);
      else zdNav.appendChild(a);
      return;
    }

    // Legacy sidebar fallback
    var settingsLi = navLinks.querySelector('[data-page="timer"]');
    settingsLi = settingsLi ? settingsLi.closest('li') : null;
    if (settingsLi) navLinks.insertBefore(li, settingsLi);
    else navLinks.appendChild(li);
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
    btn.addEventListener('click', function () { window.location.href = 'solver.html'; });
    qaCard.appendChild(btn);
  }

  // ── 3. Inject minimal CSS ─────────────────────────────
  function _injectStyles() {
    if (document.getElementById('zd-solver-nav-styles')) return;
    var style = document.createElement('style');
    style.id = 'zd-solver-nav-styles';
    style.textContent = `
      /* Kinetic Zero sidebar nav link */
      .zd-nav-link-solver .solver-nav-badge,
      .nav-link-solver .solver-nav-badge {
        display: inline-block;
        margin-left: auto;
        font-size: 0.55rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        padding: 0.1rem 0.45rem;
        border-radius: 99px;
        background: #00f0ff;
        color: #000;
        line-height: 1.6;
      }
      .zd-nav-link-solver:hover { color: #00f0ff !important; }
      .nav-link-solver:hover,
      .nav-link-solver.active   { color: var(--accent, #00f0ff) !important; }

      /* Dashboard quick-action button */
      .solver-qa-btn {
        background: rgba(0,240,255,0.07) !important;
        border-color: rgba(0,240,255,0.2) !important;
        color: #00f0ff !important;
      }
      .solver-qa-btn:hover {
        background: rgba(0,240,255,0.14) !important;
      }
    `;
    document.head.appendChild(style);
  }

})();