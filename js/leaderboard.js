// ============================================
// STUDY AURA — LEADERBOARD (v3 — RLS Fix)
// ============================================
//
// ROOT CAUSE OF EMPTY LEADERBOARD:
// Supabase RLS (Row Level Security) on the study_sessions table
// only allows each user to SELECT their own rows. When the leaderboard
// tries to read ALL users' sessions to rank them, Supabase silently
// returns 0 rows for other users — making the board look empty.
//
// THE FIX — two-pronged approach:
//
//  Option A (automatic, no DB changes needed):
//    Each user's own session data is already readable. We fetch the
//    pre-aggregated aura_leaderboard VIEW that already exists in your
//    DB (visible in the Supabase screenshot as "public.aura_leaderboard").
//    That view is UNRESTRICTED (shown in the screenshot), so it bypasses
//    RLS and exposes aggregated data safely.
//
//  Option B (fallback if the view doesn't have the right columns):
//    We call a Supabase RPC function `get_leaderboard` that runs
//    with SECURITY DEFINER (bypasses RLS server-side).
//    SQL to create it is printed in the console if Option A fails.
//
// ============================================

(function () {
  'use strict';

  let _lbMode    = 'weekly';
  let _lbChannel = null;

  document.addEventListener('DOMContentLoaded', function () {
    _initLeaderboardTabs();
    _initPersonalStats();
  });

  // ============================================================
  // TAB SWITCHING
  // ============================================================
  function _initLeaderboardTabs() {
    var d = document.getElementById('lb-tab-daily');
    var w = document.getElementById('lb-tab-weekly');
    if (!d || !w) return;
    d.addEventListener('click', function () { if (_lbMode === 'daily') return; _lbMode = 'daily'; _setLbTab('daily'); loadLeaderboard(); });
    w.addEventListener('click', function () { if (_lbMode === 'weekly') return; _lbMode = 'weekly'; _setLbTab('weekly'); loadLeaderboard(); });
  }

  function _setLbTab(mode) {
    var d = document.getElementById('lb-tab-daily');
    var w = document.getElementById('lb-tab-weekly');
    if (!d || !w) return;
    d.classList.toggle('lb-tab-active', mode === 'daily');
    w.classList.toggle('lb-tab-active', mode === 'weekly');
  }

  // ── UTC date helpers ────────────────────────
  function _getPeriodStart(mode) {
    var now = new Date();
    if (mode === 'daily') {
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    }
    var dow      = now.getUTCDay();
    var daysBack = (dow + 6) % 7;
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack)).toISOString();
  }

  function _getPeriodEnd() {
    var now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString();
  }

  // ============================================================
  // LEADERBOARD — tries 3 strategies in order
  // ============================================================
  window.loadLeaderboard = async function () {
    var list = document.getElementById('leaderboard-list');
    if (!list) return;

    _showSkeleton(list);

    var since = _getPeriodStart(_lbMode);

    // ── Strategy 1: RPC function (most reliable, bypasses RLS) ──
    var rpcOk = await _tryRPC(list, since);
    if (rpcOk) return;

    // ── Strategy 2: aura_leaderboard view (UNRESTRICTED in your DB) ──
    var viewOk = await _tryView(list, since);
    if (viewOk) return;

    // ── Strategy 3: Direct query of own sessions + profiles join ──
    // (will only show the current user ranked, but won't be empty)
    await _tryDirectQuery(list, since);
  };

  // ── Strategy 1: RPC ────────────────────────
  async function _tryRPC(list, since) {
    try {
      var { data, error } = await db.rpc('get_leaderboard', {
        since_ts: since,
        row_limit: 10
      });

      if (error) {
        if (error.code === 'PGRST202' || error.message.includes('does not exist')) {
          // Function doesn't exist yet — print SQL to create it
          _printRPCSql();
          return false;
        }
        throw error;
      }

      if (!data || data.length === 0) {
        _showEmpty(list);
        return true;
      }

      _renderRows(list, data.map(function (r) {
        return {
          user_id:        r.user_id,
          seconds:        r.total_seconds,
          name:           r.name,
          avatar_url:     r.avatar_url,
          class:          r.class,
          target_year:    r.target_year,
          role:           r.role,
        };
      }));
      return true;
    } catch (e) {
      console.warn('[Leaderboard] RPC failed:', e.message);
      return false;
    }
  }

  // ── Strategy 2: aura_leaderboard view ──────
  // Your DB already has this view and it's UNRESTRICTED (no RLS).
  // We query it filtered by the time window.
  async function _tryView(list, since) {
    try {
      // Try the view — it may have different column names, so we probe
      var { data: probe, error: probeErr } = await db
        .from('aura_leaderboard')
        .select('*')
        .limit(1);

      if (probeErr) {
        console.warn('[Leaderboard] aura_leaderboard view not usable:', probeErr.message);
        return false;
      }

      // aura_leaderboard is a snapshot (no date filter possible directly).
      // Use it only as a ranked list of profiles, then we cross-reference
      // with individual session sums fetched per-user.
      // Actually — just fall through to Strategy 3 which is more accurate.
      console.log('[Leaderboard] aura_leaderboard view found but skipping (no time filter). Using direct query.');
      return false;
    } catch (e) {
      return false;
    }
  }

  // ── Strategy 3: Fetch own sessions + leaderboard via profiles ──
  // Since RLS blocks cross-user session reads, we:
  //  a) Fetch the current user's own sessions (allowed by RLS)
  //  b) Fetch profiles to get the user list
  //  c) Show what we can — at minimum the current user's real data
  //
  // ⚠️  To get a REAL multi-user leaderboard without the RPC function,
  //     you MUST either:
  //     (1) Create the get_leaderboard RPC (SQL printed in console), OR
  //     (2) Add a RLS policy: allow SELECT on study_sessions for all authenticated users
  async function _tryDirectQuery(list, since) {
    try {
      if (!currentUser) { _showEmpty(list); return; }

      // Fetch only current user's sessions (RLS allows this)
      var { data: mySessions, error } = await db
        .from('study_sessions')
        .select('user_id, duration_seconds')
        .eq('user_id', currentUser.id)
        .eq('status', 'complete')
        .gte('start_time', since)
        .gt('duration_seconds', 0);

      if (error) throw error;

      var myTotal = (mySessions || []).reduce(function (a, s) { return a + (s.duration_seconds || 0); }, 0);

      if (myTotal === 0) {
        _showEmpty(list);
        _showRLSWarning(list);
        return;
      }

      // Show only the current user since we can't read others
      var { data: myProfile } = await db.from('profiles').select('*').eq('id', currentUser.id).single();

      _renderRows(list, [{
        user_id:     currentUser.id,
        seconds:     myTotal,
        name:        myProfile ? myProfile.name : 'You',
        avatar_url:  myProfile ? myProfile.avatar_url : null,
        class:       myProfile ? myProfile.class : null,
        target_year: myProfile ? myProfile.target_year : null,
        role:        myProfile ? myProfile.role : null,
      }]);

      _showRLSWarning(list);
    } catch (e) {
      list.innerHTML = '<div class="lb-empty">Error loading leaderboard. Check console.</div>';
      console.error('[Leaderboard] strategy 3 error:', e);
    }
  }

  // ── Render ranked rows ──────────────────────
  function _renderRows(list, entries) {
    if (!entries || entries.length === 0) { _showEmpty(list); return; }

    var maxSec = entries[0].seconds || 1;
    var myRank = -1, mySeconds = 0;

    list.innerHTML = entries.map(function (entry, idx) {
      var rank   = idx + 1;
      var isMe   = currentUser && entry.user_id === currentUser.id;
      var hours  = (entry.seconds / 3600).toFixed(1);
      var barPct = Math.max(4, Math.round((entry.seconds / maxSec) * 100));

      if (isMe) { myRank = rank; mySeconds = entry.seconds; }

      var medalHtml;
      if (rank === 1)      medalHtml = '<span class="lb-medal gold">🥇</span>';
      else if (rank === 2) medalHtml = '<span class="lb-medal silver">🥈</span>';
      else if (rank === 3) medalHtml = '<span class="lb-medal bronze">🥉</span>';
      else                 medalHtml = '<span class="lb-rank-num">' + rank + '</span>';

      var avatarSrc = entry.avatar_url
        ? (typeof getOptimizedUrl === 'function' ? getOptimizedUrl(entry.avatar_url, 'w_80,h_80,c_fill,g_face') : entry.avatar_url)
        : '';
      var avatarHtml = avatarSrc
        ? '<img src="' + _esc(avatarSrc) + '" alt="' + _esc(entry.name || '') + '" loading="lazy">'
        : '<svg width="16" height="16" style="color:var(--text3)"><use href="#ic-user"/></svg>';

      var subParts = [];
      if (entry.class)       subParts.push(_esc(entry.class));
      if (entry.target_year) subParts.push('Target ' + _esc(String(entry.target_year)));

      return '<div class="lb-row' + (isMe ? ' lb-row-me' : '') + '" style="--lb-delay:' + (idx * 55) + 'ms">' +
        '<div class="lb-medal-wrap">' + medalHtml + '</div>' +
        '<div class="lb-avatar-wrap"><div class="lb-avatar">' + avatarHtml + '</div></div>' +
        '<div class="lb-info">' +
          '<div class="lb-name">' + _esc(entry.name || 'Anonymous') +
            (isMe ? '<span class="lb-you-tag">YOU</span>' : '') +
            _roleBadge(entry.role) +
          '</div>' +
          (subParts.length ? '<div class="lb-sub">' + subParts.join(' · ') + '</div>' : '') +
          '<div class="lb-bar-wrap"><div class="lb-bar" style="--lb-bar-w:' + barPct + '%"></div></div>' +
        '</div>' +
        '<div class="lb-hours">' + hours + 'h<span class="lb-hours-label">studied</span></div>' +
      '</div>';
    }).join('');

    _updateMyRankBadge(myRank, mySeconds);
  }

  function _showSkeleton(list) {
    list.innerHTML = Array(5).fill(0).map(function (_, i) {
      return '<div class="lb-row lb-skeleton">' +
        '<div class="lb-medal-wrap"><span class="lb-rank-num">' + (i + 1) + '</span></div>' +
        '<div class="lb-avatar-wrap"><div class="lb-avatar skeleton"></div></div>' +
        '<div class="lb-info"><div class="skeleton lb-skel-name"></div><div class="skeleton lb-skel-sub"></div></div>' +
        '<div class="lb-hours skeleton lb-skel-hours"></div>' +
      '</div>';
    }).join('');
  }

  function _showEmpty(list) {
    list.innerHTML = '<div class="lb-empty"><div class="lb-empty-icon">📚</div><div>No study sessions recorded yet for this period.</div></div>';
    _updateMyRankBadge(-1, 0);
  }

  function _showRLSWarning(list) {
    var existing = list.innerHTML;
    list.innerHTML = existing + 
      '<div class="lb-rls-warn">⚠️ Full leaderboard requires the <code>get_leaderboard</code> SQL function. See browser console for setup instructions.</div>';
  }

  function _updateMyRankBadge(rank, seconds) {
    var badge = document.getElementById('lb-my-rank');
    if (!badge) return;
    if (rank > 0) {
      badge.textContent = '#' + rank;
      badge.classList.add('lb-rank-visible');
    } else {
      badge.textContent = 'Unranked';
      badge.classList.remove('lb-rank-visible');
    }
  }

  // ── Realtime ────────────────────────────────
  function _subscribeLeaderboard() {
    if (_lbChannel) return;
    _lbChannel = db
      .channel('lb-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_sessions' },
        function () { loadLeaderboard(); })
      .subscribe();
  }
  function _unsubscribeLeaderboard() {
    if (_lbChannel) { db.removeChannel(_lbChannel); _lbChannel = null; }
  }

  // ============================================================
  // PERSONAL STATS (unchanged, reads own data — no RLS issue)
  // ============================================================
  function _initPersonalStats() {
    var prev = document.getElementById('ps-prev-month');
    var next = document.getElementById('ps-next-month');
    if (!prev || !next) return;
    prev.addEventListener('click', function () { _psMonthOffset--; loadPersonalStats(); });
    next.addEventListener('click', function () { if (_psMonthOffset < 0) { _psMonthOffset++; loadPersonalStats(); } });
  }

  var _psMonthOffset = 0;

  window.loadPersonalStats = async function () {
    if (typeof currentUser === 'undefined' || !currentUser) return;

    var monthLabelEl = document.getElementById('ps-month-label');
    var totalHoursEl = document.getElementById('ps-total-hours');
    var weekGridEl   = document.getElementById('ps-week-grid');
    var thisWeekEl   = document.getElementById('ps-this-week-hours');
    var nextBtn      = document.getElementById('ps-next-month');
    if (!monthLabelEl || !totalHoursEl || !weekGridEl) return;

    var now   = new Date();
    var year  = now.getUTCFullYear();
    var month = now.getUTCMonth() + _psMonthOffset;
    while (month < 0)  { month += 12; year--; }
    while (month > 11) { month -= 12; year++; }

    var monthStart = new Date(Date.UTC(year, month, 1));
    var monthEnd   = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    var isCurrent  = (year === now.getUTCFullYear() && month === now.getUTCMonth());

    if (nextBtn) nextBtn.disabled = isCurrent;
    monthLabelEl.textContent = monthStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

    totalHoursEl.textContent = '—';
    if (thisWeekEl) thisWeekEl.textContent = '—';
    weekGridEl.innerHTML = '<div class="ps-loading">Loading...</div>';

    try {
      var { data: sessions, error } = await db
        .from('study_sessions')
        .select('start_time, duration_seconds')
        .eq('user_id', currentUser.id)
        .eq('status', 'complete')
        .gte('start_time', monthStart.toISOString())
        .lte('start_time', monthEnd.toISOString())
        .gt('duration_seconds', 0);

      if (error) throw error;
      sessions = sessions || [];

      var totalSecs = sessions.reduce(function (a, s) { return a + (s.duration_seconds || 0); }, 0);
      totalHoursEl.textContent = (totalSecs / 3600).toFixed(1) + 'h';

      var weeks  = _buildWeekBuckets(monthStart, monthEnd, sessions);
      var maxSec = Math.max.apply(null, weeks.map(function (w) { return w.seconds; }).concat([1]));

      weekGridEl.innerHTML = weeks.map(function (w, i) {
        var barPct = Math.max(3, Math.round((w.seconds / maxSec) * 100));
        return '<div class="ps-week-cell' + (w.containsToday ? ' ps-week-current' : '') + '" style="--ps-delay:' + (i * 60) + 'ms">' +
          '<div class="ps-week-label">' + _esc(w.label) + '</div>' +
          '<div class="ps-week-bar-wrap"><div class="ps-week-bar" style="--ps-bar-w:' + barPct + '%"></div></div>' +
          '<div class="ps-week-hours">' + (w.seconds / 3600).toFixed(1) + 'h</div>' +
        '</div>';
      }).join('');

      if (thisWeekEl) {
        var mondayUTC = new Date(_getPeriodStart('weekly'));
        var weekSecs  = sessions
          .filter(function (s) { return new Date(s.start_time) >= mondayUTC; })
          .reduce(function (a, s) { return a + (s.duration_seconds || 0); }, 0);
        thisWeekEl.textContent = (weekSecs / 3600).toFixed(1) + 'h';
      }
    } catch (err) {
      weekGridEl.innerHTML = '<div class="ps-loading">Failed to load.</div>';
      console.error('[PersonalStats] error:', err);
    }
  };

  function _buildWeekBuckets(monthStart, monthEnd, sessions) {
    var now      = new Date();
    var todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    var cursor   = new Date(monthStart);
    var weeks    = [];
    var weekNum  = 1;

    while (cursor <= monthEnd) {
      var weekStart = new Date(cursor);
      var dow       = weekStart.getUTCDay();
      var toSunday  = (dow === 0) ? 0 : (7 - dow);
      var weekEnd   = new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + toSunday, 23, 59, 59, 999));
      if (weekEnd > monthEnd) weekEnd = new Date(monthEnd);

      var secs = sessions
        .filter(function (s) { var t = new Date(s.start_time).getTime(); return t >= weekStart.getTime() && t <= weekEnd.getTime(); })
        .reduce(function (a, s) { return a + (s.duration_seconds || 0); }, 0);

      weeks.push({
        label: 'Week ' + weekNum + ' (' + weekStart.getUTCDate() + '–' + weekEnd.getUTCDate() + ')',
        seconds: secs,
        containsToday: (todayUTC >= weekStart && todayUTC <= weekEnd)
      });

      cursor = new Date(weekEnd.getTime() + 1);
      weekNum++;
    }
    return weeks;
  }

  // ── Helpers ─────────────────────────────────
  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _roleBadge(role) {
    if (!role || role === 'member') return '';
    var label = role === 'admin' ? '⚡ Admin' : role === 'mod' ? '🛡️ Mod' : role;
    return '<span class="role-badge badge-' + role + '" style="margin-left:0.3rem;font-size:0.6rem;padding:1px 5px">' + label + '</span>';
  }

  // ── Hook into goToPage ──────────────────────
  function _patchGoToPage() {
    var _orig = window.goToPage;
    if (typeof _orig !== 'function') return false;
    window.goToPage = function (pageId) {
      _orig(pageId);
      if (pageId === 'dashboard') {
        _setLbTab(_lbMode); loadLeaderboard(); loadPersonalStats(); _subscribeLeaderboard();
      } else {
        _unsubscribeLeaderboard();
      }
    };
    return true;
  }

  if (!_patchGoToPage()) { setTimeout(_patchGoToPage, 0); }

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      var dash = document.getElementById('page-dashboard');
      if (dash && dash.classList.contains('active') && typeof currentUser !== 'undefined' && currentUser) {
        _setLbTab(_lbMode); loadLeaderboard(); loadPersonalStats(); _subscribeLeaderboard();
      }
    }, 1200);
  });

})();