/* ═══════════════════════════════════════════════════════════════
   ZEROday — NOTIFICATION BELL + PANEL  (v3 · Standalone)
   Drop ONE <script src="zd-notifications.js"></script> at end of
   <body>. No other changes needed. Replaces zeroday-notif-patch.js.
   ═══════════════════════════════════════════════════════════════ */

(function ZDNotifications() {
  'use strict';

  /* ── CSS injected directly — no external file needed ─────── */
  var CSS = [
    /* ── Bell button wrapper ──────────────────────────────── */
    '#zd-bell-wrap{',
      'position:fixed;',
      'top:16px;',
      'right:20px;',
      'z-index:99999;',        /* always on top */
    '}',
    /* Hide on mobile — they have the bottom-nav removed Alerts */
    '@media(max-width:600px){#zd-bell-wrap{display:none;}}',

    /* ── Bell button ──────────────────────────────────────── */
    '#zd-bell-btn{',
      'position:relative;',
      'width:44px;height:44px;',
      'border-radius:14px;',
      'border:1.5px solid var(--border-hover);',
      'background:var(--card);',
      'color:var(--text2);',
      'cursor:pointer;',
      'display:flex;align-items:center;justify-content:center;',
      'transition:all 0.22s cubic-bezier(0.34,1.56,0.64,1);',
      'box-shadow:0 4px 24px rgba(0,0,0,0.18),0 1px 0 rgba(255,255,255,0.04) inset;',
    '}',
    '#zd-bell-btn:hover{',
      'background:var(--bg3);',
      'border-color:var(--accent);',
      'color:var(--accent);',
      'transform:translateY(-2px) scale(1.05);',
      'box-shadow:0 8px 32px var(--accent-glow),0 0 0 1px var(--accent);',
    '}',
    '#zd-bell-btn:active{transform:scale(0.96);}',

    /* ── Unread badge on the bell ─────────────────────────── */
    '#zd-bell-badge{',
      'position:absolute;',
      'top:-5px;right:-5px;',
      'min-width:20px;height:20px;',
      'padding:0 5px;',
      'border-radius:99px;',
      'background:var(--red);',
      'color:#fff;',
      'font-size:0.6rem;font-weight:800;',
      'font-family:"Space Grotesk",sans-serif;',
      'display:none;align-items:center;justify-content:center;',
      'border:2px solid var(--bg);',
      'animation:zd-badge-pop 0.3s cubic-bezier(0.34,1.56,0.64,1);',
    '}',
    '@keyframes zd-badge-pop{from{transform:scale(0)}to{transform:scale(1)}}',

    /* ── Backdrop ─────────────────────────────────────────── */
    '#zd-notif-backdrop{',
      'display:none;',
      'position:fixed;inset:0;',
      'z-index:99997;',
      'background:rgba(0,0,0,0.35);',
      'backdrop-filter:blur(4px);',
      '-webkit-backdrop-filter:blur(4px);',
      'animation:zd-fade-in 0.18s ease;',
    '}',
    '#zd-notif-backdrop.open{display:block;}',
    '@keyframes zd-fade-in{from{opacity:0}to{opacity:1}}',

    /* ── Panel ────────────────────────────────────────────── */
    '#zd-notif-panel{',
      'position:fixed;',
      'top:70px;right:20px;',
      'width:400px;',
      'max-height:calc(100vh - 90px);',
      'z-index:99998;',
      'background:var(--card);',
      'border:1px solid var(--border-hover);',
      'border-radius:20px;',
      'overflow:hidden;',
      'display:flex;flex-direction:column;',
      'box-shadow:0 24px 80px rgba(0,0,0,0.45),0 0 0 1px rgba(255,255,255,0.04) inset;',
      'transform:translateY(-12px) scale(0.97);',
      'opacity:0;',
      'pointer-events:none;',
      'transition:transform 0.26s cubic-bezier(0.34,1.56,0.64,1),opacity 0.2s ease;',
    '}',
    '#zd-notif-panel.open{',
      'transform:translateY(0) scale(1);',
      'opacity:1;',
      'pointer-events:all;',
    '}',
    '@media(max-width:600px){',
      '#zd-notif-panel{top:0;right:0;left:0;width:100%;border-radius:0 0 20px 20px;max-height:80vh;}',
    '}',

    /* ── Panel Header ─────────────────────────────────────── */
    '#zd-notif-header{',
      'padding:1.1rem 1.25rem 0.9rem;',
      'border-bottom:1px solid var(--border);',
      'background:var(--bg2);',
      'display:flex;align-items:center;gap:0.75rem;',
      'flex-shrink:0;',
    '}',
    '.zd-nh-icon{',
      'width:36px;height:36px;border-radius:10px;',
      'background:var(--accent-glow);',
      'border:1px solid var(--accent);',
      'display:flex;align-items:center;justify-content:center;',
      'color:var(--accent);flex-shrink:0;',
    '}',
    '.zd-nh-title{',
      'font-family:"Bebas Neue","Space Grotesk",sans-serif;',
      'font-size:1.15rem;letter-spacing:0.08em;',
      'color:var(--text);flex:1;',
    '}',
    '#zd-notif-unread-pill{',
      'padding:0.2rem 0.55rem;',
      'border-radius:99px;',
      'background:var(--red);',
      'color:#fff;',
      'font-size:0.62rem;font-weight:800;',
      'font-family:"Space Grotesk",sans-serif;',
      'display:none;',
    '}',
    '.zd-nh-close{',
      'width:30px;height:30px;border-radius:8px;',
      'border:1px solid var(--border-hover);',
      'background:var(--bg3);',
      'color:var(--text3);',
      'cursor:pointer;display:flex;align-items:center;justify-content:center;',
      'font-size:0.9rem;line-height:1;',
      'transition:all 0.15s;flex-shrink:0;',
    '}',
    '.zd-nh-close:hover{background:var(--border-hover);color:var(--text);}',

    /* ── Admin action bar ─────────────────────────────────── */
    '#zd-notif-adminbar{',
      'display:none;',
      'padding:0.6rem 1.25rem;',
      'background:var(--bg3);',
      'border-bottom:1px solid var(--border);',
      'gap:0.5rem;',
      'flex-shrink:0;',
    '}',
    '#zd-notif-adminbar.visible{display:flex;}',
    '.zd-admin-action-btn{',
      'flex:1;',
      'padding:0.45rem 0.75rem;',
      'border-radius:8px;',
      'border:1px solid var(--border-hover);',
      'background:var(--bg2);',
      'color:var(--text2);',
      'font-size:0.72rem;font-weight:700;',
      'letter-spacing:0.06em;text-transform:uppercase;',
      'font-family:"Space Grotesk",sans-serif;',
      'cursor:pointer;',
      'display:flex;align-items:center;justify-content:center;gap:0.4rem;',
      'transition:all 0.18s;',
    '}',
    '.zd-admin-action-btn:hover{',
      'background:var(--accent-glow);',
      'border-color:var(--accent);',
      'color:var(--accent);',
    '}',
    '.zd-admin-action-btn.danger:hover{',
      'background:rgba(248,113,113,0.1);',
      'border-color:var(--red);color:var(--red);',
    '}',

    /* ── Notifications list ───────────────────────────────── */
    '#zd-notif-list{',
      'flex:1;overflow-y:auto;',
      'scrollbar-width:thin;',
      'scrollbar-color:var(--border-hover) transparent;',
    '}',
    '#zd-notif-list::-webkit-scrollbar{width:4px;}',
    '#zd-notif-list::-webkit-scrollbar-thumb{background:var(--border-hover);border-radius:4px;}',

    /* ── Single notification item ─────────────────────────── */
    '.zd-ni{',
      'display:flex;gap:0.85rem;align-items:flex-start;',
      'padding:1rem 1.25rem;',
      'border-bottom:1px solid var(--border);',
      'transition:background 0.15s;',
      'animation:zd-ni-in 0.3s ease both;',
      'animation-delay:var(--ni-delay,0ms);',
    '}',
    '@keyframes zd-ni-in{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}',
    '.zd-ni:last-child{border-bottom:none;}',
    '.zd-ni:hover{background:var(--bg2);}',
    '.zd-ni.personal{',
      'border-left:3px solid var(--accent);',
      'background:var(--accent-glow);',
    '}',
    '.zd-ni.personal:hover{filter:brightness(1.05);}',

    /* icon bubble */
    '.zd-ni-icon{',
      'width:38px;height:38px;border-radius:11px;',
      'display:flex;align-items:center;justify-content:center;',
      'font-size:1rem;flex-shrink:0;',
      'border:1px solid var(--border);',
    '}',
    '.zd-ni-icon.info   {background:rgba(96,165,250,0.12);border-color:rgba(96,165,250,0.25);}',
    '.zd-ni-icon.success{background:rgba(52,211,153,0.12);border-color:rgba(52,211,153,0.25);}',
    '.zd-ni-icon.warn   {background:rgba(251,146,60,0.12);border-color:rgba(251,146,60,0.25);}',
    '.zd-ni-icon.danger {background:rgba(248,113,113,0.12);border-color:rgba(248,113,113,0.25);}',

    '.zd-ni-body{flex:1;min-width:0;}',
    '.zd-ni-title{',
      'font-size:0.85rem;font-weight:700;',
      'color:var(--text);',
      'font-family:"Space Grotesk",sans-serif;',
      'margin-bottom:0.2rem;',
      'display:flex;align-items:center;gap:0.4rem;',
    '}',
    '.zd-ni-personal-tag{',
      'font-size:0.52rem;font-weight:800;letter-spacing:0.08em;',
      'text-transform:uppercase;',
      'background:var(--accent-grad);color:#fff;',
      'border-radius:4px;padding:1px 5px;',
      'flex-shrink:0;',
    '}',
    '.zd-ni-msg{font-size:0.79rem;color:var(--text2);line-height:1.5;}',
    '.zd-ni-time{',
      'font-size:0.66rem;color:var(--text3);',
      'margin-top:0.35rem;',
      'font-family:"DM Mono",monospace;',
    '}',

    /* ── Empty state ──────────────────────────────────────── */
    '.zd-ni-empty{',
      'padding:3rem 1.5rem;text-align:center;',
    '}',
    '.zd-ni-empty-icon{',
      'width:56px;height:56px;border-radius:16px;',
      'background:var(--bg3);border:1px solid var(--border);',
      'display:flex;align-items:center;justify-content:center;',
      'margin:0 auto 1rem;',
      'color:var(--text3);',
    '}',
    '.zd-ni-empty-title{',
      'font-family:"Space Grotesk",sans-serif;',
      'font-size:0.9rem;font-weight:700;',
      'color:var(--text2);margin-bottom:0.3rem;',
    '}',
    '.zd-ni-empty-sub{font-size:0.78rem;color:var(--text3);}',

    /* ── Skeleton loader ──────────────────────────────────── */
    '.zd-skel{',
      'padding:1rem 1.25rem;',
      'display:flex;gap:0.85rem;',
      'border-bottom:1px solid var(--border);',
    '}',
    '.zd-skel-icon{width:38px;height:38px;border-radius:11px;background:var(--bg3);flex-shrink:0;}',
    '.zd-skel-lines{flex:1;display:flex;flex-direction:column;gap:0.4rem;padding-top:0.3rem;}',
    '.zd-skel-line{height:10px;border-radius:5px;background:var(--bg3);}',
    '.zd-skel-line.w70{width:70%;}',
    '.zd-skel-line.w50{width:50%;}',
    '.zd-skel-line.w30{width:30%;}',
    '.zd-skel-icon,.zd-skel-line{animation:zd-shimmer 1.4s ease-in-out infinite;}',
    '@keyframes zd-shimmer{0%,100%{opacity:0.4}50%{opacity:0.8}}',

    /* ── Footer ───────────────────────────────────────────── */
    '#zd-notif-footer{',
      'padding:0.75rem 1.25rem;',
      'border-top:1px solid var(--border);',
      'background:var(--bg2);',
      'display:flex;align-items:center;justify-content:space-between;',
      'flex-shrink:0;',
    '}',
    '.zd-mark-read-btn{',
      'background:none;border:none;',
      'color:var(--accent);',
      'font-size:0.75rem;font-weight:600;',
      'font-family:"Space Grotesk",sans-serif;',
      'cursor:pointer;',
      'transition:color 0.15s;',
      'letter-spacing:0.03em;',
    '}',
    '.zd-mark-read-btn:hover{color:var(--accent2);}',
    '.zd-footer-count{',
      'font-size:0.68rem;color:var(--text3);',
      'font-family:"DM Mono",monospace;',
    '}',

    /* ── Composer overlay (broadcast / direct) ────────────── */
    '.zd-composer-overlay{',
      'position:fixed;inset:0;z-index:999999;',
      'background:rgba(0,0,0,0.6);',
      'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);',
      'display:flex;align-items:center;justify-content:center;',
      'padding:1.5rem;',
      'opacity:0;transition:opacity 0.22s;',
    '}',
    '.zd-composer-overlay.open{opacity:1;}',
    '.zd-composer{',
      'width:100%;max-width:480px;',
      'background:var(--card);',
      'border:1px solid var(--border-hover);',
      'border-radius:20px;',
      'overflow:hidden;',
      'box-shadow:0 32px 80px rgba(0,0,0,0.5);',
      'transform:translateY(16px) scale(0.97);',
      'transition:transform 0.26s cubic-bezier(0.34,1.56,0.64,1);',
    '}',
    '.zd-composer-overlay.open .zd-composer{transform:translateY(0) scale(1);}',
    '.zd-composer-head{',
      'padding:1.1rem 1.3rem;',
      'border-bottom:1px solid var(--border);',
      'background:var(--bg2);',
      'display:flex;align-items:center;gap:0.75rem;',
    '}',
    '.zd-composer-head-icon{',
      'width:34px;height:34px;border-radius:9px;',
      'background:var(--accent-glow);border:1px solid var(--accent);',
      'display:flex;align-items:center;justify-content:center;color:var(--accent);',
    '}',
    '.zd-composer-title{',
      'font-family:"Bebas Neue","Space Grotesk",sans-serif;',
      'font-size:1rem;letter-spacing:0.08em;color:var(--text);flex:1;',
    '}',
    '.zd-composer-body{',
      'padding:1.3rem;display:flex;flex-direction:column;gap:1rem;',
      'max-height:60vh;overflow-y:auto;',
    '}',
    '.zd-field{display:flex;flex-direction:column;gap:0.35rem;}',
    '.zd-label{',
      'font-size:0.68rem;font-weight:700;text-transform:uppercase;',
      'letter-spacing:0.1em;color:var(--text3);',
      'font-family:"Space Grotesk",sans-serif;',
    '}',
    '.zd-input,.zd-textarea,.zd-select{',
      'background:var(--bg2);border:1px solid var(--border-hover);',
      'color:var(--text);border-radius:10px;',
      'padding:0.65rem 0.9rem;',
      'font-family:"Space Grotesk",sans-serif;font-size:0.85rem;',
      'width:100%;box-sizing:border-box;',
      'transition:border-color 0.18s,box-shadow 0.18s;',
    '}',
    '.zd-input::placeholder,.zd-textarea::placeholder{color:var(--text3);}',
    '.zd-input:focus,.zd-textarea:focus,.zd-select:focus{',
      'outline:none;border-color:var(--accent);',
      'box-shadow:0 0 0 3px var(--accent-glow);',
    '}',
    '.zd-textarea{resize:vertical;min-height:80px;}',
    '.zd-char-count{font-size:0.66rem;color:var(--text3);text-align:right;font-family:"DM Mono",monospace;}',
    '.zd-type-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;}',
    '.zd-type-opt{',
      'padding:0.45rem 0.7rem;border-radius:8px;',
      'border:1px solid var(--border);background:var(--bg2);',
      'color:var(--text2);font-size:0.78rem;font-weight:600;',
      'font-family:"Space Grotesk",sans-serif;',
      'cursor:pointer;display:flex;align-items:center;gap:0.35rem;',
      'transition:all 0.15s;',
    '}',
    '.zd-type-opt input[type=radio]{display:none;}',
    '.zd-type-opt.sel-info   {background:rgba(96,165,250,0.12);border-color:var(--blue);color:var(--blue);}',
    '.zd-type-opt.sel-success{background:rgba(52,211,153,0.12);border-color:var(--green);color:var(--green);}',
    '.zd-type-opt.sel-warn   {background:rgba(251,146,60,0.12);border-color:var(--orange);color:var(--orange);}',
    '.zd-type-opt.sel-danger {background:rgba(248,113,113,0.12);border-color:var(--red);color:var(--red);}',
    '.zd-lookup-row{display:flex;gap:0.5rem;}',
    '.zd-lookup-btn{',
      'padding:0.65rem 1rem;border-radius:10px;',
      'border:1px solid var(--accent);background:var(--accent-glow);',
      'color:var(--accent);font-size:0.78rem;font-weight:700;',
      'font-family:"Space Grotesk",sans-serif;cursor:pointer;',
      'white-space:nowrap;transition:all 0.18s;',
    '}',
    '.zd-lookup-btn:hover{background:var(--accent);color:#fff;}',
    '.zd-user-preview{',
      'display:none;',
      'background:var(--bg2);border:1px solid var(--border-hover);',
      'border-radius:10px;padding:0.7rem 0.9rem;',
      'align-items:center;gap:0.65rem;margin-top:0.5rem;',
    '}',
    '.zd-user-preview.show{display:flex;}',
    '.zd-user-avatar{',
      'width:36px;height:36px;border-radius:50%;',
      'background:var(--bg3);border:2px solid var(--border-hover);',
      'display:flex;align-items:center;justify-content:center;',
      'overflow:hidden;flex-shrink:0;font-size:1.1rem;',
    '}',
    '.zd-user-name{font-size:0.85rem;font-weight:700;color:var(--text);font-family:"Space Grotesk",sans-serif;}',
    '.zd-user-email{font-size:0.7rem;color:var(--text3);font-family:"DM Mono",monospace;}',
    '.zd-err{font-size:0.72rem;color:var(--red);margin-top:0.3rem;display:none;}',
    '.zd-err.show{display:block;}',
    '.zd-composer-foot{',
      'padding:1rem 1.3rem;border-top:1px solid var(--border);',
      'background:var(--bg2);display:flex;align-items:center;',
      'justify-content:flex-end;gap:0.6rem;',
    '}',
    '.zd-btn-cancel{',
      'padding:0.6rem 1.1rem;border-radius:9px;',
      'border:1px solid var(--border-hover);background:transparent;',
      'color:var(--text2);font-size:0.82rem;font-weight:600;',
      'font-family:"Space Grotesk",sans-serif;cursor:pointer;',
      'transition:all 0.18s;',
    '}',
    '.zd-btn-cancel:hover{background:var(--bg3);color:var(--text);}',
    '.zd-btn-send{',
      'padding:0.6rem 1.4rem;border-radius:9px;',
      'border:none;background:var(--accent-grad);',
      'color:#fff;font-size:0.82rem;font-weight:700;',
      'letter-spacing:0.05em;',
      'font-family:"Space Grotesk",sans-serif;cursor:pointer;',
      'display:flex;align-items:center;gap:0.4rem;',
      'transition:all 0.2s;',
      'box-shadow:0 4px 16px var(--accent-glow);',
    '}',
    '.zd-btn-send:hover{transform:translateY(-1px);box-shadow:0 8px 24px var(--accent-glow);filter:brightness(1.1);}',
    '.zd-btn-send:disabled{opacity:0.45;transform:none;cursor:not-allowed;}'
  ].join('');

  /* ── Inject CSS into <head> ───────────────────────────── */
  function injectCSS() {
    if (document.getElementById('zd-notif-css')) return;
    var el = document.createElement('style');
    el.id = 'zd-notif-css';
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  /* ── Build bell HTML ──────────────────────────────────── */
  function buildBell() {
    if (document.getElementById('zd-bell-wrap')) return;
    var wrap = document.createElement('div');
    wrap.id = 'zd-bell-wrap';
    wrap.innerHTML = [
      '<button id="zd-bell-btn" aria-label="Notifications">',
        /* Bell icon */
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">',
          '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>',
          '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        '</svg>',
        '<span id="zd-bell-badge"></span>',
      '</button>'
    ].join('');
    document.body.appendChild(wrap);
    document.getElementById('zd-bell-btn').addEventListener('click', togglePanel);
  }

  /* ── Build panel HTML ─────────────────────────────────── */
  function buildPanel() {
    if (document.getElementById('zd-notif-panel')) return;

    /* Backdrop */
    var bd = document.createElement('div');
    bd.id = 'zd-notif-backdrop';
    bd.addEventListener('click', closePanel);
    document.body.appendChild(bd);

    /* Panel */
    var panel = document.createElement('div');
    panel.id = 'zd-notif-panel';
    panel.setAttribute('role', 'dialog');
    panel.innerHTML = [
      /* Header */
      '<div id="zd-notif-header">',
        '<div class="zd-nh-icon">',
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
            '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>',
            '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
          '</svg>',
        '</div>',
        '<span class="zd-nh-title">Notifications</span>',
        '<span id="zd-notif-unread-pill"></span>',
        '<button class="zd-nh-close" id="zd-notif-close" aria-label="Close">✕</button>',
      '</div>',

      /* Admin bar — visible only for admins */
      '<div id="zd-notif-adminbar">',
        '<button class="zd-admin-action-btn" id="zd-btn-broadcast">',
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
            '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
          '</svg>',
          'Broadcast',
        '</button>',
        '<button class="zd-admin-action-btn" id="zd-btn-direct">',
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
            '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
          '</svg>',
          'Send to User',
        '</button>',
      '</div>',

      /* List */
      '<div id="zd-notif-list"></div>',

      /* Footer */
      '<div id="zd-notif-footer">',
        '<button class="zd-mark-read-btn" id="zd-mark-read">Mark all as read</button>',
        '<span class="zd-footer-count" id="zd-footer-count"></span>',
      '</div>'
    ].join('');

    document.body.appendChild(panel);

    /* Wire up events */
    document.getElementById('zd-notif-close').addEventListener('click', closePanel);
    document.getElementById('zd-mark-read').addEventListener('click', markAllRead);
    document.getElementById('zd-btn-broadcast').addEventListener('click', function() { closePanel(); openBroadcast(); });
    document.getElementById('zd-btn-direct').addEventListener('click', function() { closePanel(); openDirect(); });
  }

  /* ── Panel open / close ───────────────────────────────── */
  var _open = false;

  function openPanel() {
    if (_open) return;
    _open = true;
    buildPanel();
    var panel = document.getElementById('zd-notif-panel');
    var bd    = document.getElementById('zd-notif-backdrop');

    /* Show admin bar if admin */
    var adminBar = document.getElementById('zd-notif-adminbar');
    if (isAdmin() && adminBar) adminBar.classList.add('visible');

    /* Animate in */
    requestAnimationFrame(function() {
      if (bd) bd.classList.add('open');
      if (panel) panel.classList.add('open');
    });

    loadNotifications();
    markSeen();
  }

  function closePanel() {
    _open = false;
    var panel = document.getElementById('zd-notif-panel');
    var bd    = document.getElementById('zd-notif-backdrop');
    if (panel) panel.classList.remove('open');
    if (bd)    bd.classList.remove('open');
  }

  function togglePanel() { _open ? closePanel() : openPanel(); }

  /* ── Load notifications ───────────────────────────────── */
  async function loadNotifications() {
    var list = document.getElementById('zd-notif-list');
    if (!list) return;

    /* Skeleton */
    list.innerHTML = [0,1,2].map(function() {
      return '<div class="zd-skel">' +
        '<div class="zd-skel-icon"></div>' +
        '<div class="zd-skel-lines">' +
          '<div class="zd-skel-line w70"></div>' +
          '<div class="zd-skel-line w50"></div>' +
          '<div class="zd-skel-line w30"></div>' +
        '</div></div>';
    }).join('');

    if (typeof currentUser === 'undefined' || !currentUser || typeof db === 'undefined') {
      list.innerHTML = emptyHTML('Sign in to see notifications', 'You need to be logged in.');
      return;
    }

    try {
      var res = await db.from('notifications')
        .select('*')
        .or('user_id.is.null,user_id.eq.' + currentUser.id)
        .order('created_at', { ascending: false })
        .limit(40);

      var notifs = (res.data || []).filter(function(n) {
        return !n.expires_at || new Date(n.expires_at) > new Date();
      });

      /* Footer count */
      var footerCount = document.getElementById('zd-footer-count');
      if (footerCount) footerCount.textContent = notifs.length + ' notification' + (notifs.length !== 1 ? 's' : '');

      if (!notifs.length) {
        list.innerHTML = emptyHTML('All clear!', 'No notifications yet — you\'re caught up.');
        return;
      }

      list.innerHTML = notifs.map(function(n, i) {
        var isPersonal = n.user_id !== null;
        var type = n.type || 'info';
        var icons = { info:'📢', success:'✅', warn:'⚠️', danger:'🚨' };
        return [
          '<div class="zd-ni ' + (isPersonal ? 'personal' : '') + '" style="--ni-delay:' + (i * 40) + 'ms">',
            '<div class="zd-ni-icon ' + esc(type) + '">' + (icons[type] || '📢') + '</div>',
            '<div class="zd-ni-body">',
              '<div class="zd-ni-title">',
                esc(n.title || ''),
                isPersonal ? '<span class="zd-ni-personal-tag">Personal</span>' : '',
              '</div>',
              '<div class="zd-ni-msg">' + esc(n.message || n.body || '') + '</div>',
              '<div class="zd-ni-time">' + timeAgo(n.created_at) + '</div>',
            '</div>',
          '</div>'
        ].join('');
      }).join('');

    } catch(err) {
      list.innerHTML = emptyHTML('Could not load', 'Something went wrong. Try again.');
    }
  }

  function emptyHTML(title, sub) {
    return [
      '<div class="zd-ni-empty">',
        '<div class="zd-ni-empty-icon">',
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.5">',
            '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>',
            '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
          '</svg>',
        '</div>',
        '<div class="zd-ni-empty-title">' + esc(title) + '</div>',
        '<div class="zd-ni-empty-sub">' + esc(sub) + '</div>',
      '</div>'
    ].join('');
  }

  /* ── Badge count ──────────────────────────────────────── */
  async function refreshBadge() {
    if (typeof currentUser === 'undefined' || !currentUser || typeof db === 'undefined') return;
    try {
      var r = await db.from('notifications')
        .select('id', { count: 'exact', head: true })
        .or('user_id.is.null,user_id.eq.' + currentUser.id);
      var total = r.count || 0;
      var seen  = parseInt(localStorage.getItem('sa_notif_seen') || '0');
      var unread = Math.max(0, total - seen);
      var badge = document.getElementById('zd-bell-badge');
      var pill  = document.getElementById('zd-notif-unread-pill');
      if (badge) {
        badge.textContent = unread > 9 ? '9+' : String(unread);
        badge.style.display = unread > 0 ? 'flex' : 'none';
      }
      if (pill) {
        pill.textContent = unread > 0 ? String(unread) + ' new' : '';
        pill.style.display = unread > 0 ? 'inline' : 'none';
      }
      /* also sync legacy badge if it still exists in the DOM */
      var legacy = document.getElementById('notif-badge');
      if (legacy) legacy.style.display = unread > 0 ? 'inline' : 'none';
    } catch(e) {}
  }

  function markSeen() {
    if (typeof currentUser === 'undefined' || typeof db === 'undefined') return;
    db.from('notifications')
      .select('id', { count: 'exact', head: true })
      .or('user_id.is.null,user_id.eq.' + currentUser.id)
      .then(function(r) {
        localStorage.setItem('sa_notif_seen', r.count || 0);
        refreshBadge();
      });
  }

  function markAllRead() {
    markSeen();
    var badge = document.getElementById('zd-bell-badge');
    var pill  = document.getElementById('zd-notif-unread-pill');
    if (badge) badge.style.display = 'none';
    if (pill)  pill.style.display  = 'none';
    if (typeof showToast === 'function') showToast('All notifications marked as read');
  }

  /* ── Hide old sidebar Alerts nav link ─────────────────── */
  function patchSidebarNav() {
    document.querySelectorAll('.nav-link').forEach(function(link) {
      if (link.dataset.page === 'notifications') {
        var li = link.closest('li');
        if (li) li.style.display = 'none';
        else link.style.display = 'none';
      }
    });
  }

  /* ── Helpers ──────────────────────────────────────────── */
  function isAdmin() {
    return typeof currentProfile !== 'undefined' && currentProfile && currentProfile.role === 'admin';
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function timeAgo(ts) {
    if (!ts) return '';
    var d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (d < 60)    return 'just now';
    if (d < 3600)  return Math.floor(d/60) + 'm ago';
    if (d < 86400) return Math.floor(d/3600) + 'h ago';
    return Math.floor(d/86400) + 'd ago';
  }

  /* ── Broadcast composer ───────────────────────────────── */
  function openBroadcast() {
    var id = 'zd-broadcast-overlay';
    var existing = document.getElementById(id);
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'zd-composer-overlay';
    overlay.innerHTML = [
      '<div class="zd-composer">',
        '<div class="zd-composer-head">',
          '<div class="zd-composer-head-icon">',
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
              '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
            '</svg>',
          '</div>',
          '<span class="zd-composer-title">Broadcast to All Users</span>',
          '<button class="zd-nh-close zd-close-this">✕</button>',
        '</div>',
        '<div class="zd-composer-body">',
          typeGridHTML('bc'),
          '<div class="zd-field">',
            '<label class="zd-label">Title <span style="color:var(--red)">*</span></label>',
            '<input class="zd-input" id="zd-bc-title" placeholder="Notification title" maxlength="80">',
            '<div class="zd-char-count" id="zd-bc-title-c">0 / 80</div>',
          '</div>',
          '<div class="zd-field">',
            '<label class="zd-label">Message <span style="color:var(--red)">*</span></label>',
            '<textarea class="zd-textarea" id="zd-bc-msg" placeholder="Message to all users…" maxlength="280"></textarea>',
            '<div class="zd-char-count" id="zd-bc-msg-c">0 / 280</div>',
          '</div>',
        '</div>',
        '<div class="zd-composer-foot">',
          '<button class="zd-btn-cancel zd-close-this">Cancel</button>',
          '<button class="zd-btn-send" id="zd-bc-send">',
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
              '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
            '</svg>',
            'Send Now',
          '</button>',
        '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(overlay);
    wireTypeGrid(overlay, 'bc');
    wireCharCount(overlay, 'zd-bc-title', 'zd-bc-title-c');
    wireCharCount(overlay, 'zd-bc-msg', 'zd-bc-msg-c');
    overlay.querySelectorAll('.zd-close-this').forEach(function(b) {
      b.addEventListener('click', function() { overlay.remove(); });
    });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.getElementById('zd-bc-send').addEventListener('click', function() { sendBroadcast(overlay); });
    requestAnimationFrame(function() { overlay.classList.add('open'); });
  }

  /* ── Direct composer ──────────────────────────────────── */
  function openDirect() {
    var id = 'zd-direct-overlay';
    var existing = document.getElementById(id);
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'zd-composer-overlay';
    overlay.innerHTML = [
      '<div class="zd-composer">',
        '<div class="zd-composer-head">',
          '<div class="zd-composer-head-icon">',
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
              '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
            '</svg>',
          '</div>',
          '<span class="zd-composer-title">Send to User</span>',
          '<button class="zd-nh-close zd-close-this">✕</button>',
        '</div>',
        '<div class="zd-composer-body">',
          '<div class="zd-field">',
            '<label class="zd-label">Recipient Email <span style="color:var(--red)">*</span></label>',
            '<div class="zd-lookup-row">',
              '<input class="zd-input" id="zd-dr-email" type="email" placeholder="user@example.com" style="flex:1">',
              '<button class="zd-lookup-btn" id="zd-dr-lookup">Look Up</button>',
            '</div>',
            '<div class="zd-user-preview" id="zd-dr-preview">',
              '<div class="zd-user-avatar" id="zd-dr-avatar">👤</div>',
              '<div style="flex:1;min-width:0">',
                '<div class="zd-user-name" id="zd-dr-name"></div>',
                '<div class="zd-user-email" id="zd-dr-email-disp"></div>',
              '</div>',
              '<span style="color:var(--green);font-size:1.1rem">✓</span>',
            '</div>',
            '<div class="zd-err" id="zd-dr-err"></div>',
          '</div>',
          typeGridHTML('dr'),
          '<div class="zd-field">',
            '<label class="zd-label">Title <span style="color:var(--red)">*</span></label>',
            '<input class="zd-input" id="zd-dr-title" placeholder="Notification title" maxlength="80">',
            '<div class="zd-char-count" id="zd-dr-title-c">0 / 80</div>',
          '</div>',
          '<div class="zd-field">',
            '<label class="zd-label">Message <span style="color:var(--red)">*</span></label>',
            '<textarea class="zd-textarea" id="zd-dr-msg" placeholder="Personal message…" maxlength="280"></textarea>',
            '<div class="zd-char-count" id="zd-dr-msg-c">0 / 280</div>',
          '</div>',
        '</div>',
        '<div class="zd-composer-foot">',
          '<button class="zd-btn-cancel zd-close-this">Cancel</button>',
          '<button class="zd-btn-send" id="zd-dr-send" disabled style="opacity:0.45;cursor:not-allowed">',
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
              '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
            '</svg>',
            'Send',
          '</button>',
        '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(overlay);
    wireTypeGrid(overlay, 'dr');
    wireCharCount(overlay, 'zd-dr-title', 'zd-dr-title-c');
    wireCharCount(overlay, 'zd-dr-msg', 'zd-dr-msg-c');
    overlay.querySelectorAll('.zd-close-this').forEach(function(b) {
      b.addEventListener('click', function() { overlay.remove(); });
    });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    /* Lookup */
    var lookupBtn = document.getElementById('zd-dr-lookup');
    var emailIn   = document.getElementById('zd-dr-email');
    var sendBtn   = document.getElementById('zd-dr-send');
    lookupBtn.addEventListener('click', async function() {
      var email = emailIn.value.trim().toLowerCase();
      var errEl = document.getElementById('zd-dr-err');
      var prev  = document.getElementById('zd-dr-preview');
      errEl.className = 'zd-err'; prev.className = 'zd-user-preview';
      overlay._uid = null; sendBtn.disabled = true; sendBtn.style.opacity = '0.45';
      if (!email || !email.includes('@')) { errEl.textContent = 'Enter a valid email.'; errEl.classList.add('show'); return; }
      lookupBtn.textContent = 'Looking up…'; lookupBtn.disabled = true;
      try {
        var r = await db.from('profiles').select('id,name,email,avatar_url').eq('email', email).single();
        if (r.error || !r.data) throw new Error('No user found with that email.');
        var u = r.data;
        overlay._uid = u.id;
        document.getElementById('zd-dr-name').textContent = u.name || 'Unknown';
        document.getElementById('zd-dr-email-disp').textContent = u.email || email;
        var av = document.getElementById('zd-dr-avatar');
        av.innerHTML = u.avatar_url ? '<img src="' + esc(u.avatar_url) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">' : '👤';
        prev.classList.add('show');
        sendBtn.disabled = false; sendBtn.style.opacity = '1'; sendBtn.style.cursor = 'pointer';
      } catch(err) {
        errEl.textContent = '❌ ' + err.message; errEl.classList.add('show');
      } finally {
        lookupBtn.textContent = 'Look Up'; lookupBtn.disabled = false;
      }
    });
    emailIn.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); lookupBtn.click(); } });
    sendBtn.addEventListener('click', function() { sendDirect(overlay); });
    requestAnimationFrame(function() { overlay.classList.add('open'); });
  }

  /* ── Type grid builder ─────────────────────────────────── */
  function typeGridHTML(prefix) {
    var types = [
      { v:'info',    label:'📢 Info' },
      { v:'success', label:'✅ Success' },
      { v:'warn',    label:'⚠️ Warning' },
      { v:'danger',  label:'🚨 Alert' }
    ];
    return '<div class="zd-field"><label class="zd-label">Type</label><div class="zd-type-grid">' +
      types.map(function(t) {
        return '<label class="zd-type-opt" data-type="' + t.v + '" data-prefix="' + prefix + '">' +
          '<input type="radio" name="zd-' + prefix + '-type" value="' + t.v + '"' + (t.v === 'info' ? ' checked' : '') + '>' +
          t.label + '</label>';
      }).join('') +
    '</div></div>';
  }

  function wireTypeGrid(container, prefix) {
    container.querySelectorAll('.zd-type-opt[data-prefix="' + prefix + '"]').forEach(function(opt) {
      opt.addEventListener('click', function() {
        container.querySelectorAll('.zd-type-opt[data-prefix="' + prefix + '"]').forEach(function(o) {
          o.className = 'zd-type-opt';
          o.setAttribute('data-prefix', prefix);
          o.setAttribute('data-type', o.getAttribute('data-type'));
        });
        var type = opt.getAttribute('data-type');
        opt.className = 'zd-type-opt sel-' + type;
        var radio = opt.querySelector('input[type=radio]');
        if (radio) radio.checked = true;
      });
    });
  }

  function wireCharCount(container, inputId, countId) {
    var input = document.getElementById(inputId);
    var count = document.getElementById(countId);
    if (input && count) {
      input.addEventListener('input', function() {
        count.textContent = input.value.length + ' / ' + input.maxLength;
      });
    }
  }

  /* ── Send broadcast ───────────────────────────────────── */
  async function sendBroadcast(overlay) {
    var title   = (document.getElementById('zd-bc-title') || {}).value || '';
    var message = (document.getElementById('zd-bc-msg')   || {}).value || '';
    var sendBtn = document.getElementById('zd-bc-send');
    title = title.trim(); message = message.trim();
    if (!title)   { toast('Title is required'); return; }
    if (!message) { toast('Message is required'); return; }
    sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
    try {
      var session = await getSession();
      var res = await fetch(window.SUPABASE_URL + '/functions/v1/send-notification', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},
        body:JSON.stringify({ title:title, message:message, user_id:null })
      });
      var json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      toast('✅ Broadcast sent!');
      overlay.remove();
      refreshBadge();
    } catch(err) {
      toast('❌ ' + err.message);
      sendBtn.disabled = false; sendBtn.textContent = 'Send Now';
    }
  }

  /* ── Send direct ──────────────────────────────────────── */
  async function sendDirect(overlay) {
    var title   = (document.getElementById('zd-dr-title') || {}).value || '';
    var message = (document.getElementById('zd-dr-msg')   || {}).value || '';
    var sendBtn = document.getElementById('zd-dr-send');
    title = title.trim(); message = message.trim();
    if (!overlay._uid) { toast('Look up a user first'); return; }
    if (!title)   { toast('Title is required'); return; }
    if (!message) { toast('Message is required'); return; }
    sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
    try {
      var session = await getSession();
      var res = await fetch(window.SUPABASE_URL + '/functions/v1/send-notification', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},
        body:JSON.stringify({ title:title, message:message, user_id:overlay._uid })
      });
      var json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      toast('✅ Notification sent!');
      overlay.remove();
      refreshBadge();
    } catch(err) {
      toast('❌ ' + err.message);
      sendBtn.disabled = false; sendBtn.textContent = 'Send';
    }
  }

  async function getSession() {
    var r = await db.auth.getSession();
    if (!r.data || !r.data.session) throw new Error('Not authenticated');
    return r.data.session;
  }

  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
    else console.log('[ZDNotif]', msg);
  }

  /* ── Public API ───────────────────────────────────────── */
  window.ZDNotif = {
    open:          openPanel,
    close:         closePanel,
    toggle:        togglePanel,
    refresh:       refreshBadge,
    openBroadcast: openBroadcast,
    openDirect:    openDirect
  };

  /* Patch legacy loadNotificationCount if it exists */
  window.loadNotificationCount = refreshBadge;

  /* ── INIT ─────────────────────────────────────────────── */
  function init() {
    injectCSS();
    buildBell();
    patchSidebarNav();

    /* Start badge polling after a short delay (wait for auth) */
    setTimeout(refreshBadge, 1500);
    setInterval(refreshBadge, 90000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();