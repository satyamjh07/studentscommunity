// ============================================================
// ZERODAY — NOTIFICATION NAVBAR PATCH v1.1 (FIXED)
// Fixes:
//   1. Desktop bell had no click listener → panel never opened
//   2. Duplicate id="notif-badge" caused DOM conflicts
//   3. Mobile close / bell toggle unreliable after async innerHTML rebuild
//   4. Mobile panel z-index lower than topbar on some browsers
// ============================================================

(function ZDNotifPatch() {
  'use strict';

  // ── Wait for DOM ────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    _injectBellUI();
    _patchSidebarNav();
    _initPanelLogic();
  });

  // ── 1. Inject bell button into the topbar ───────────────
  function _injectBellUI() {
    // Mobile topbar
    var topbar = document.querySelector('.mobile-topbar');
    if (topbar) {
      var bellWrap = document.createElement('div');
      bellWrap.className = 'notif-bell-wrap';
      bellWrap.style.position = 'relative';
      // FIX: use unique id "notif-badge-mobile" to avoid duplicate-id conflict
      //      with the sidebar's existing id="notif-badge"
      bellWrap.innerHTML = _bellButtonHTML('notif-bell-btn', 'notif-badge-mobile');

      var mobileAvatar = topbar.querySelector('.mobile-avatar');
      if (mobileAvatar) {
        topbar.insertBefore(bellWrap, mobileAvatar);
      } else {
        topbar.appendChild(bellWrap);
      }
    }

    // Desktop: fixed top-right bell (visible only on wide screens)
    _injectDesktopBell();
  }

  // FIX: badgeId param so every badge element has a unique id
  function _bellButtonHTML(btnId, badgeId) {
    return [
      '<button id="' + btnId + '" aria-label="Notifications" title="Notifications">',
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">',
          '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>',
          '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        '</svg>',
        '<span class="notif-badge" id="' + badgeId + '" style="display:none">0</span>',
      '</button>'
    ].join('');
  }

  function _injectDesktopBell() {
    var desktopWrap = document.createElement('div');
    desktopWrap.className = 'notif-bell-wrap zd-desktop-bell';
    desktopWrap.style.cssText = [
      'position:fixed',
      'top:1.1rem',
      'right:1.4rem',
      'z-index:10000',  // FIX: must be above np-panel (9999) so badge stays visible
      'display:none'
    ].join(';');

    // FIX: use unique id "notif-bell-btn-desktop" and "notif-badge-desktop"
    desktopWrap.innerHTML = [
      '<button id="notif-bell-btn-desktop" aria-label="Notifications" title="Notifications"',
      ' style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;',
      'background:rgba(124,111,255,0.07);border:1px solid rgba(124,111,255,0.15);border-radius:50%;',
      'cursor:pointer;color:var(--text2);transition:all 0.2s;position:relative;">',
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">',
          '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>',
          '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        '</svg>',
        '<span class="notif-badge" id="notif-badge-desktop" style="display:none">0</span>',
      '</button>'
    ].join('');

    document.body.appendChild(desktopWrap);

    // Show only on desktop
    var mq = window.matchMedia('(min-width: 769px)');
    function handleMQ(e) { desktopWrap.style.display = e.matches ? 'block' : 'none'; }
    if (mq.addEventListener) {
      mq.addEventListener('change', handleMQ);
    } else {
      mq.addListener(handleMQ); // Safari < 14 fallback
    }
    handleMQ(mq);

    _desktopWrap = desktopWrap;
  }

  var _desktopWrap = null;

  // ── 2. Remove notifications from sidebar nav ────────────
  function _patchSidebarNav() {
    var navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(function (link) {
      if (link.dataset.page === 'notifications') {
        var li = link.closest('li');
        if (li) li.style.display = 'none';
      }
    });
  }

  // ── 3. Panel logic ──────────────────────────────────────
  var _isOpen = false;

  function _initPanelLogic() {
    // FIX: Wire BOTH bell buttons here with their own click listeners.
    // Previously the desktop bell was never wired — this was the main bug.

    // Mobile bell
    document.addEventListener('click', function (e) {
      var mobileBell  = document.getElementById('notif-bell-btn');
      var desktopBell = document.getElementById('notif-bell-btn-desktop');
      var panel       = document.getElementById('zd-notif-panel');

      // Bell button clicks — toggle panel
      if ((mobileBell  && mobileBell.contains(e.target)) ||
          (desktopBell && desktopBell.contains(e.target))) {
        e.stopPropagation();
        _toggle();
        return;
      }

      // Close button or mark-read button inside panel — let their
      // onclick handlers fire; don't interfere here.
      if (_isOpen && panel && panel.contains(e.target)) {
        return;
      }

      // Outside click → close
      if (_isOpen && panel && !panel.contains(e.target)) {
        _closePanel();
      }
    }, true); // FIX: use capture phase so this fires before any stopPropagation

    // Load initial badge count
    _refreshBadge();
    // Poll every 90s
    setInterval(_refreshBadge, 90000);
  }

  function _toggle() {
    _isOpen ? _closePanel() : _openPanel();
  }

  function _openPanel() {
    _isOpen = true;
    _ensurePanel();
    var panel = document.getElementById('zd-notif-panel');
    if (panel) {
      _positionPanel(panel);
      requestAnimationFrame(function () {
        _positionPanel(panel);
        panel.classList.add('np-open');
        _loadNotifications();
      });
    }
    _markSeen();
    _refreshBadge();
  }

  function _closePanel() {
    _isOpen = false;
    var panel = document.getElementById('zd-notif-panel');
    if (panel) panel.classList.remove('np-open');
  }

  // ── 4. Build panel DOM ───────────────────────────────────
  function _ensurePanel() {
    if (document.getElementById('zd-notif-panel')) return;

    var panel = document.createElement('div');
    panel.id = 'zd-notif-panel';
    panel.className = 'np-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Notifications');
    panel.innerHTML = '<div class="np-body"><div class="np-empty"><div class="np-empty-title">Loading...</div></div></div>';

    document.body.appendChild(panel);
    _positionPanel(panel);

    // FIX: Use event delegation on the panel itself for close/mark-read buttons.
    // This survives innerHTML rebuilds since the listener is on the panel element,
    // not on the dynamically-created buttons inside it.
    panel.addEventListener('click', function (e) {
      // Close button
      if (e.target.closest('.np-close-btn')) {
        e.stopPropagation();
        _closePanel();
        return;
      }
      // Mark all read button
      if (e.target.closest('.np-mark-read-btn')) {
        e.stopPropagation();
        ZDNotif._markAllRead();
        return;
      }
      // Admin broadcast button
      if (e.target.closest('.np-admin-btn') && !e.target.closest('.np-direct-btn')) {
        e.stopPropagation();
        _openBroadcast();
        return;
      }
      // Admin direct (send to user) button
      if (e.target.closest('.np-direct-btn')) {
        e.stopPropagation();
        _openDirect();
        return;
      }
    });
  }

  function _positionPanel(panel) {
    var isMobile = window.innerWidth < 769;

    if (isMobile) {
      // FIX: z-index must beat mobile-topbar (z-index: 99) but we also need
      //      the panel to render BELOW the topbar, not on top of it.
      //      Use z-index: 200 (above topbar's 99, below modals at 1000+)
      panel.style.position  = 'fixed';
      panel.style.top       = '56px'; // height of mobile-topbar
      panel.style.left      = '8px';
      panel.style.right     = '8px';
      panel.style.width     = 'auto';
      panel.style.maxHeight = 'calc(100vh - 72px)';
      panel.style.zIndex    = '200';
      return;
    }

    // Desktop: anchor below the bell button
    var bell = document.getElementById('notif-bell-btn-desktop') ||
               document.getElementById('notif-bell-btn');
    if (!bell) return;

    var rect   = bell.getBoundingClientRect();
    var panelW = 380;
    var left   = rect.right - panelW;
    if (left < 8) left = 8;
    if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8;

    panel.style.position  = 'fixed';
    panel.style.top       = (rect.bottom + 8) + 'px';
    panel.style.left      = left + 'px';
    panel.style.right     = 'auto';
    panel.style.width     = panelW + 'px';
    panel.style.maxHeight = 'calc(100vh - ' + (rect.bottom + 20) + 'px)';
    panel.style.zIndex    = '9999';
  }

  // ── 5. Load notifications from Supabase ─────────────────
  async function _loadNotifications() {
    var panel = document.getElementById('zd-notif-panel');
    if (!panel) return;

    if (typeof currentUser === 'undefined' || !currentUser) {
      panel.innerHTML = _emptyHTML('Sign in to see notifications');
      return;
    }

    var isAdmin = _isAdmin();

    panel.innerHTML = _headerHTML(isAdmin) +
      '<div class="np-body"><div class="np-empty"><div class="np-empty-title">Loading...</div></div></div>';

    try {
      var result = await db.from('notifications')
        .select('*')
        .or('user_id.is.null,user_id.eq.' + currentUser.id)
        .order('created_at', { ascending: false })
        .limit(30);

      var notifs = (result.data || []).filter(function (n) {
        return !n.expires_at || new Date(n.expires_at) > new Date();
      });

      var body;
      if (!notifs.length) {
        body = '<div class="np-body">' + _emptyBodyHTML() + '</div>';
      } else {
        body = '<div class="np-body">' + notifs.map(_notifItemHTML).join('') + '</div>' +
               '<div class="np-footer"><button class="np-mark-read-btn">Mark all as read</button></div>';
      }

      panel.innerHTML = _headerHTML(isAdmin) + body;
      _positionPanel(panel);

    } catch (err) {
      panel.innerHTML = _headerHTML(isAdmin) +
        '<div class="np-body"><div class="np-empty"><div class="np-empty-title">Failed to load</div></div></div>';
      _positionPanel(panel);
    }
  }

  // FIX: Removed inline onclick="ZDNotif.xxx()" from all header buttons.
  //      Clicks are now handled by the delegated listener on the panel element
  //      (set up once in _ensurePanel), so they survive innerHTML rebuilds.
  function _headerHTML(isAdmin) {
    return [
      '<div class="np-header">',
        '<div class="np-header-left">',
          '<span class="np-header-title">Alerts</span>',
        '</div>',
        '<div class="np-header-right">',
          isAdmin ? [
            '<button class="np-admin-btn np-direct-btn" style="margin-right:0.3rem">',
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px">',
                '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>',
                '<circle cx="12" cy="7" r="4"/>',
              '</svg>',
              'Send to User',
            '</button>',
            '<button class="np-admin-btn">',
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px">',
                '<line x1="22" y1="2" x2="11" y2="13"/>',
                '<polygon points="22 2 15 22 11 13 2 9 22 2"/>',
              '</svg>',
              'Broadcast',
            '</button>'
          ].join('') : '',
          '<button class="np-close-btn" aria-label="Close">✕</button>',
        '</div>',
      '</div>'
    ].join('');
  }

  function _emptyBodyHTML() {
    return [
      '<div class="np-empty">',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:36px;height:36px;opacity:0.25;margin-bottom:10px">',
          '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>',
          '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        '</svg>',
        '<div class="np-empty-title">No alerts</div>',
        '<div class="np-empty-sub">You\'re all caught up.</div>',
      '</div>'
    ].join('');
  }

  function _notifItemHTML(n) {
    var isPersonal = n.user_id !== null;
    var iconMap = { danger: '🚨', warn: '⚠️', success: '✅', info: '📢' };
    var typeKey  = n.type || 'info';
    var icon     = iconMap[typeKey] || '📢';
    var timeStr  = _timeAgo(n.created_at);

    return [
      '<div class="np-item' + (isPersonal ? ' np-item--unread' : '') + '">',
        '<div class="np-item-icon type-' + _escHtml(typeKey) + '">' + icon + '</div>',
        '<div class="np-item-content">',
          '<div class="np-item-title">'  + _escHtml(n.title   || '')           + '</div>',
          '<div class="np-item-body">'   + _escHtml(n.message || n.body || '') + '</div>',
          '<div class="np-item-time">'   + timeStr + (isPersonal ? ' · Personal' : '') + '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  function _emptyHTML(msg) {
    return '<div class="np-body"><div class="np-empty"><div class="np-empty-title">' + _escHtml(msg) + '</div></div></div>';
  }

  // ── 6. Badge count ───────────────────────────────────────
  async function _refreshBadge() {
    if (typeof currentUser === 'undefined' || !currentUser || typeof db === 'undefined') return;

    try {
      var result = await db.from('notifications')
        .select('id', { count: 'exact', head: true })
        .or('user_id.is.null,user_id.eq.' + currentUser.id);

      var total  = result.count || 0;
      var seen   = parseInt(localStorage.getItem('sa_notif_seen') || '0');
      var unread = Math.max(0, total - seen);

      // FIX: updated badge IDs to match the new unique IDs
      var badges = [
        document.getElementById('notif-badge-mobile'),
        document.getElementById('notif-badge-desktop'),
        // Also sync the original sidebar badge if it still exists
        document.getElementById('notif-badge')
      ];
      badges.forEach(function (badge) {
        if (!badge) return;
        if (unread > 0) {
          badge.textContent = unread > 9 ? '9+' : String(unread);
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }
      });
    } catch (e) { /* silent */ }
  }

  function _markSeen() {
    if (typeof currentUser === 'undefined' || typeof db === 'undefined') return;
    db.from('notifications')
      .select('id', { count: 'exact', head: true })
      .or('user_id.is.null,user_id.eq.' + currentUser.id)
      .then(function (r) {
        localStorage.setItem('sa_notif_seen', r.count || 0);
      });
  }

  // ── 7. Admin Broadcast ───────────────────────────────────
  function _openBroadcast() {
    _closePanel();

    var existing = document.getElementById('zd-broadcast-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'zd-broadcast-overlay';
    overlay.className = 'np-composer-overlay';
    overlay.innerHTML = [
      '<div class="np-composer" role="dialog">',
        '<div class="np-composer-header">',
          '<div class="np-composer-title">',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px">',
              '<line x1="22" y1="2" x2="11" y2="13"/>',
              '<polygon points="22 2 15 22 11 13 2 9 22 2"/>',
            '</svg>',
            'Broadcast Notification',
          '</div>',
          '<button class="np-close-btn np-broadcast-close">✕</button>',
        '</div>',
        '<div class="np-composer-body">',
          '<div class="np-field">',
            '<label class="np-label">Type</label>',
            '<div class="np-type-grid">',
              '<label class="np-type-option np-type-info"><input type="radio" name="zd-npc-type" value="info" checked><span>📢 Info</span></label>',
              '<label class="np-type-option np-type-success"><input type="radio" name="zd-npc-type" value="success"><span>✅ Success</span></label>',
              '<label class="np-type-option np-type-warn"><input type="radio" name="zd-npc-type" value="warn"><span>⚠️ Warning</span></label>',
              '<label class="np-type-option np-type-danger"><input type="radio" name="zd-npc-type" value="danger"><span>🚨 Alert</span></label>',
            '</div>',
          '</div>',
          '<div class="np-field">',
            '<label class="np-label">Title <span style="color:var(--red)">*</span></label>',
            '<input class="np-input" id="zd-npc-title" placeholder="Notification title" maxlength="80"/>',
            '<div class="np-char-count" id="zd-npc-title-count">0 / 80</div>',
          '</div>',
          '<div class="np-field">',
            '<label class="np-label">Message <span style="color:var(--red)">*</span></label>',
            '<textarea class="np-textarea" id="zd-npc-body" placeholder="Message to all users…" rows="3" maxlength="280"></textarea>',
            '<div class="np-char-count" id="zd-npc-body-count">0 / 280</div>',
          '</div>',
        '</div>',
        '<div class="np-composer-footer">',
          '<button class="np-cancel-btn np-broadcast-close">Cancel</button>',
          '<button class="np-send-btn" id="zd-npc-send-btn">',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px">',
              '<line x1="22" y1="2" x2="11" y2="13"/>',
              '<polygon points="22 2 15 22 11 13 2 9 22 2"/>',
            '</svg>',
            'Send Now',
          '</button>',
        '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(overlay);

    // Char counters
    ['title', 'body'].forEach(function (field) {
      var el    = document.getElementById('zd-npc-' + field);
      var count = document.getElementById('zd-npc-' + field + '-count');
      if (el && count) {
        el.addEventListener('input', function () {
          count.textContent = el.value.length + ' / ' + el.maxLength;
        });
      }
    });

    // Send button
    var sendBtn = document.getElementById('zd-npc-send-btn');
    if (sendBtn) sendBtn.addEventListener('click', _sendBroadcast);

    // Close buttons (✕ and Cancel) — use class instead of inline onclick
    overlay.querySelectorAll('.np-broadcast-close').forEach(function (btn) {
      btn.addEventListener('click', function () { overlay.remove(); });
    });

    // Close on backdrop click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });

    requestAnimationFrame(function () {
      overlay.classList.add('np-composer-overlay--open');
    });
  }

  // ── Send to a specific user by email ────────────────────
  function _openDirect() {
    _closePanel();

    var existing = document.getElementById('zd-direct-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'zd-direct-overlay';
    overlay.className = 'np-composer-overlay';
    overlay.innerHTML = [
      '<div class="np-composer" role="dialog">',
        '<div class="np-composer-header">',
          '<div class="np-composer-title">',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px">',
              '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>',
              '<circle cx="12" cy="7" r="4"/>',
            '</svg>',
            'Send to User',
          '</div>',
          '<button class="np-close-btn np-direct-close">✕</button>',
        '</div>',

        '<div class="np-composer-body">',

          // ── Email lookup ─────────────────────────────
          '<div class="np-field">',
            '<label class="np-label">Recipient Email <span style="color:var(--red)">*</span></label>',
            '<div style="display:flex;gap:0.5rem;align-items:center">',
              '<input class="np-input" id="zd-direct-email" placeholder="user@example.com" type="email" style="flex:1"/>',
              '<button id="zd-direct-lookup-btn" style="',
                'padding:0.55rem 0.85rem;background:var(--accent-glow);border:1px solid var(--accent);',
                'border-radius:var(--radius-xs);color:var(--accent);font-size:0.78rem;font-weight:700;',
                'cursor:pointer;white-space:nowrap;font-family:\'Space Grotesk\',sans-serif;',
                'transition:all 0.18s;letter-spacing:0.04em">',
                'Look Up',
              '</button>',
            '</div>',
            // User preview card — shown after successful lookup
            '<div id="zd-direct-user-preview" style="display:none;margin-top:0.6rem;',
              'background:var(--bg2);border:1px solid var(--border-hover);border-radius:var(--radius-xs);',
              'padding:0.6rem 0.8rem;display:none;align-items:center;gap:0.6rem">',
              '<div id="zd-direct-user-avatar" style="',
                'width:34px;height:34px;border-radius:50%;background:var(--bg3);',
                'border:2px solid var(--border-hover);display:flex;align-items:center;',
                'justify-content:center;overflow:hidden;flex-shrink:0;font-size:1.1rem">',
                '👤',
              '</div>',
              '<div style="flex:1;min-width:0">',
                '<div id="zd-direct-user-name" style="font-size:0.85rem;font-weight:700;color:var(--text);font-family:\'Space Grotesk\',sans-serif"></div>',
                '<div id="zd-direct-user-email-disp" style="font-size:0.72rem;color:var(--text3);font-family:\'DM Mono\',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>',
              '</div>',
              '<div id="zd-direct-user-check" style="color:var(--green);font-size:1rem">✓</div>',
            '</div>',
            '<div id="zd-direct-lookup-err" style="font-size:0.72rem;color:var(--red);margin-top:0.3rem;display:none"></div>',
          '</div>',

          // ── Type ──────────────────────────────────────
          '<div class="np-field">',
            '<label class="np-label">Type</label>',
            '<div class="np-type-grid">',
              '<label class="np-type-option np-type-info"><input type="radio" name="zd-direct-type" value="info" checked><span>📢 Info</span></label>',
              '<label class="np-type-option np-type-success"><input type="radio" name="zd-direct-type" value="success"><span>✅ Success</span></label>',
              '<label class="np-type-option np-type-warn"><input type="radio" name="zd-direct-type" value="warn"><span>⚠️ Warning</span></label>',
              '<label class="np-type-option np-type-danger"><input type="radio" name="zd-direct-type" value="danger"><span>🚨 Alert</span></label>',
            '</div>',
          '</div>',

          // ── Title ─────────────────────────────────────
          '<div class="np-field">',
            '<label class="np-label">Title <span style="color:var(--red)">*</span></label>',
            '<input class="np-input" id="zd-direct-title" placeholder="Notification title" maxlength="80"/>',
            '<div class="np-char-count" id="zd-direct-title-count">0 / 80</div>',
          '</div>',

          // ── Message ───────────────────────────────────
          '<div class="np-field">',
            '<label class="np-label">Message <span style="color:var(--red)">*</span></label>',
            '<textarea class="np-textarea" id="zd-direct-body" placeholder="Personal message to this user…" rows="3" maxlength="280"></textarea>',
            '<div class="np-char-count" id="zd-direct-body-count">0 / 280</div>',
          '</div>',

        '</div>',

        '<div class="np-composer-footer">',
          '<button class="np-cancel-btn np-direct-close">Cancel</button>',
          '<button class="np-send-btn" id="zd-direct-send-btn" disabled style="opacity:0.4;cursor:not-allowed">',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px">',
              '<line x1="22" y1="2" x2="11" y2="13"/>',
              '<polygon points="22 2 15 22 11 13 2 9 22 2"/>',
            '</svg>',
            'Send',
          '</button>',
        '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(overlay);

    // ── Char counters ──────────────────────────────────
    ['title', 'body'].forEach(function (field) {
      var el    = document.getElementById('zd-direct-' + field);
      var count = document.getElementById('zd-direct-' + field + '-count');
      if (el && count) {
        el.addEventListener('input', function () {
          count.textContent = el.value.length + ' / ' + el.maxLength;
        });
      }
    });

    // ── Look Up button ─────────────────────────────────
    var lookupBtn = document.getElementById('zd-direct-lookup-btn');
    var emailInput = document.getElementById('zd-direct-email');
    var sendBtn = document.getElementById('zd-direct-send-btn');

    lookupBtn.addEventListener('click', async function () {
      var email = emailInput.value.trim().toLowerCase();
      var errEl   = document.getElementById('zd-direct-lookup-err');
      var preview = document.getElementById('zd-direct-user-preview');

      errEl.style.display   = 'none';
      preview.style.display = 'none';
      sendBtn.disabled      = true;
      sendBtn.style.opacity = '0.4';
      sendBtn.style.cursor  = 'not-allowed';
      overlay._resolvedUserId = null;

      if (!email || !email.includes('@')) {
        errEl.textContent   = 'Enter a valid email address.';
        errEl.style.display = 'block';
        return;
      }

      lookupBtn.textContent = 'Looking up…';
      lookupBtn.disabled    = true;

      try {
        // Look up user by email in the profiles table
        var result = await db.from('profiles')
          .select('id, name, email, avatar_url')
          .eq('email', email)
          .single();

        if (result.error || !result.data) {
          throw new Error('No user found with that email address.');
        }

        var user = result.data;
        overlay._resolvedUserId = user.id;

        // Show the user preview card
        var nameEl   = document.getElementById('zd-direct-user-name');
        var emailEl  = document.getElementById('zd-direct-user-email-disp');
        var avatarEl = document.getElementById('zd-direct-user-avatar');

        nameEl.textContent  = user.name || 'Unknown';
        emailEl.textContent = user.email || email;

        if (user.avatar_url) {
          avatarEl.innerHTML = '<img src="' + _escHtml(user.avatar_url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
        } else {
          avatarEl.textContent = '👤';
        }

        preview.style.display = 'flex';

        // Enable Send button now that we have a valid user
        sendBtn.disabled      = false;
        sendBtn.style.opacity = '1';
        sendBtn.style.cursor  = 'pointer';

      } catch (err) {
        errEl.textContent   = '❌ ' + err.message;
        errEl.style.display = 'block';
      } finally {
        lookupBtn.textContent = 'Look Up';
        lookupBtn.disabled    = false;
      }
    });

    // Also trigger lookup on Enter in email field
    emailInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); lookupBtn.click(); }
    });

    // ── Send button ────────────────────────────────────
    sendBtn.addEventListener('click', function () { _sendDirect(overlay); });

    // ── Close buttons ──────────────────────────────────
    overlay.querySelectorAll('.np-direct-close').forEach(function (btn) {
      btn.addEventListener('click', function () { overlay.remove(); });
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });

    requestAnimationFrame(function () {
      overlay.classList.add('np-composer-overlay--open');
      emailInput.focus();
    });
  }

  async function _sendDirect(overlay) {
    var titleEl   = document.getElementById('zd-direct-title');
    var bodyEl    = document.getElementById('zd-direct-body');
    var sendBtn   = document.getElementById('zd-direct-send-btn');
    var userId    = overlay._resolvedUserId;
    var userEmail = document.getElementById('zd-direct-user-email-disp');

    var title   = titleEl && titleEl.value.trim();
    var message = bodyEl  && bodyEl.value.trim();

    if (!userId) {
      if (typeof showToast === 'function') showToast('Look up a user first');
      return;
    }
    if (!title) {
      if (typeof showToast === 'function') showToast('Title is required');
      titleEl && titleEl.focus();
      return;
    }
    if (!message) {
      if (typeof showToast === 'function') showToast('Message is required');
      bodyEl && bodyEl.focus();
      return;
    }

    sendBtn.disabled    = true;
    sendBtn.textContent = 'Sending…';

    try {
      var sessionResult = await db.auth.getSession();
      var session = sessionResult.data && sessionResult.data.session;
      if (!session) throw new Error('Not authenticated');

      var EDGE_BASE = window.SUPABASE_URL || '';
      var res = await fetch(EDGE_BASE + '/functions/v1/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          title:   title,
          message: message,
          user_id: userId    // ← specific user, not null broadcast
        })
      });

      var json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send');

      var recipientEmail = userEmail ? userEmail.textContent : 'user';
      if (typeof showToast === 'function') {
        showToast('✅ Notification sent to ' + recipientEmail + '!');
      }
      overlay.remove();
      _refreshBadge();

    } catch (err) {
      if (typeof showToast === 'function') showToast('❌ ' + err.message);
      sendBtn.disabled    = false;
      sendBtn.textContent = 'Send';
    }
  }

  async function _sendBroadcast() {
    var titleEl = document.getElementById('zd-npc-title');
    var bodyEl  = document.getElementById('zd-npc-body');
    var sendBtn = document.getElementById('zd-npc-send-btn');

    var title   = titleEl && titleEl.value.trim();
    var message = bodyEl  && bodyEl.value.trim();

    if (!title)   { if (typeof showToast === 'function') showToast('Title is required'); titleEl && titleEl.focus(); return; }
    if (!message) { if (typeof showToast === 'function') showToast('Message is required'); bodyEl && bodyEl.focus(); return; }

    sendBtn.disabled    = true;
    sendBtn.textContent = 'Sending…';

    try {
      var sessionResult = await db.auth.getSession();
      var session = sessionResult.data && sessionResult.data.session;
      if (!session) throw new Error('Not authenticated');

      var EDGE_BASE = window.SUPABASE_URL || '';
      var res = await fetch(EDGE_BASE + '/functions/v1/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({ title: title, message: message, user_id: null })
      });

      var json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send');

      if (typeof showToast === 'function') showToast('✅ Notification broadcast sent!');
      var overlay = document.getElementById('zd-broadcast-overlay');
      if (overlay) overlay.remove();
      _refreshBadge();

    } catch (err) {
      if (typeof showToast === 'function') showToast('❌ ' + err.message);
      sendBtn.disabled    = false;
      sendBtn.textContent = 'Send Now';
    }
  }

  // ── 8. Helpers ───────────────────────────────────────────
  function _isAdmin() {
    return typeof currentProfile !== 'undefined' && currentProfile && currentProfile.role === 'admin';
  }

  function _escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _timeAgo(ts) {
    if (!ts) return '';
    var diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return Math.floor(diff / 60)   + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600)  + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  // ── 9. Public API ─────────────────────────────────────────
  window.ZDNotif = {
    toggle:        _toggle,
    close:         _closePanel,
    open:          _openPanel,
    openBroadcast: _openBroadcast,
    openDirect:    _openDirect,
    _send:         _sendBroadcast,
    _sendDirect:   _sendDirect,
    _markAllRead: function () {
      _markSeen();
      var badges = [
        document.getElementById('notif-badge-mobile'),
        document.getElementById('notif-badge-desktop'),
        document.getElementById('notif-badge')
      ];
      badges.forEach(function (b) { if (b) b.style.display = 'none'; });
      if (typeof showToast === 'function') showToast('All notifications marked as read');
    },
    refresh: _refreshBadge
  };

  // Patch the existing loadNotificationCount so it updates new badges too
  var _origLoadNotifCount = window.loadNotificationCount;
  window.loadNotificationCount = function () {
    _refreshBadge();
    if (typeof _origLoadNotifCount === 'function') _origLoadNotifCount();
  };

})();