// ============================================
// STUDY AURA — MAIN APP (v3 — Aura Update)
// Adds Aura Score display on dashboard.
// ============================================

// Expose Supabase URL for Edge Function calls in other files
window.SUPABASE_URL = SUPABASE_URL;

// ── Utility: format seconds as "Xh Ym" or "Ym" ──────────────
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Aura score cache — avoid hitting the Edge Function on every dashboard visit ──
let _auraCacheScore = null;
let _auraCacheLevel = null;
let _auraCachePercentile = null;
let _auraCacheTime = 0;
const AURA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Navigation ───────────────────────────────
function goToPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  const link = document.querySelector('.nav-link[data-page="' + pageId + '"]');
  if (link) link.classList.add('active');

  closeMobileSidebar();

  if (pageId === 'dashboard') loadDashboardData();
  if (pageId === 'community') { loadPosts(); loadPopularPosts(); }
  if (pageId === 'whitenoise') onWhitenoisePageOpen();
  if (pageId === 'admin') loadAdminPanel();
  if (pageId === 'notifications') {
    loadNotifications();
    db.from('notifications').select('id', { count: 'exact', head: true }).then(({ count }) => {
      localStorage.setItem('sa_notif_seen', count || 0);
      document.getElementById('notif-badge').style.display = 'none';
    });
  }
  if (pageId === 'settings') loadSettingsForm();
}

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    goToPage(link.dataset.page);
  });
});

// ── Mobile Sidebar ───────────────────────────
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('visible');
});
document.getElementById('sidebar-overlay').addEventListener('click', closeMobileSidebar);

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}

// ── Dashboard / Analytics Data ────────────────────────
async function loadDashboardData() {
  if (!currentUser) return;

  // ── Greeting ────────────────────────────────────────
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const el = document.getElementById('dashboard-greeting');
  if (el) el.textContent =
    greeting + ', ' + (currentProfile && currentProfile.name ? currentProfile.name.split(' ')[0] : 'friend') + '! 🚀';

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const weekStart  = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1); weekStart.setHours(0,0,0,0);
  const threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  // ── Fetch study sessions (last 3 months) ────────────
  const { data: allSessions } = await db.from('study_sessions')
    .select('start_time, duration_seconds')
    .eq('user_id', currentUser.id)
    .eq('status', 'complete')
    .gte('start_time', threeMonthsAgo.toISOString())
    .order('start_time', { ascending: false });

  const sessions = allSessions || [];

  // ── KPI: Today time ──────────────────────────────────
  const todaySecs = sessions
    .filter(s => new Date(s.start_time) >= todayStart)
    .reduce((a, s) => a + (s.duration_seconds || 0), 0);

  const todayLabelEl = document.getElementById('today-time-label');
  if (todayLabelEl) todayLabelEl.textContent = 'Today: ' + (formatDuration(todaySecs) || '0m');
  // legacy id still used by leaderboard.js
  const todayTimeEl = document.getElementById('today-time');
  if (todayTimeEl) todayTimeEl.textContent = formatDuration(todaySecs) || '0m';

  // ── KPI: This week ───────────────────────────────────
  const weekSecs = sessions
    .filter(s => new Date(s.start_time) >= weekStart)
    .reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const weekEl = document.getElementById('week-time');
  if (weekEl) weekEl.textContent = formatDuration(weekSecs) || '0h';

  // ── KPI: Total sessions ──────────────────────────────
  const totalEl = document.getElementById('total-sessions');
  if (totalEl) totalEl.textContent = sessions.length;

  const todaySessCount = sessions.filter(s => new Date(s.start_time) >= todayStart).length;
  const todaySessEl = document.getElementById('today-sessions-label');
  if (todaySessEl) todaySessEl.textContent = 'Today: ' + todaySessCount + ' session' + (todaySessCount !== 1 ? 's' : '');

  // ── KPI: Streak ──────────────────────────────────────
  let streak = 0;
  const today = new Date(); today.setHours(0,0,0,0);
  let checkDate = new Date(today);
  const studyDates = new Set(sessions.map(s => {
    const d = new Date(s.start_time); d.setHours(0,0,0,0); return d.getTime();
  }));
  while (studyDates.has(checkDate.getTime())) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }
  const streakEl = document.getElementById('streak-count');
  if (streakEl) streakEl.textContent = streak;

  // Compute best streak from the data
  let bestStreak = streak;
  let tempStreak = 0;
  const sortedDates = [...studyDates].sort((a,b) => a - b);
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0 || sortedDates[i] - sortedDates[i-1] === 86400000) {
      tempStreak++;
      if (tempStreak > bestStreak) bestStreak = tempStreak;
    } else {
      tempStreak = 1;
    }
  }

  const streakBestLabel = document.getElementById('streak-best-label');
  if (streakBestLabel) streakBestLabel.textContent = 'Best: ' + bestStreak + ' days';

  // ── Streak pips (last 7 days) ─────────────────────
  const pipsEl = document.getElementById('streak-pips');
  if (pipsEl) {
    const days = ['M','T','W','T','F','S','S'];
    const todayDow = (today.getDay() + 6) % 7; // 0=Mon
    let html = '';
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const isToday = i === 0;
      const done = studyDates.has(d.getTime());
      const dow = (d.getDay() + 6) % 7;
      let cls = isToday ? (done ? 'today' : 'today') : (done ? 'done' : 'missed');
      let icon = isToday ? '★' : (done ? '✓' : '×');
      html += `<div class="an-streak-day">
        <div class="an-streak-day-name">${days[dow]}</div>
        <div class="an-streak-pip ${cls}">${icon}</div>
      </div>`;
    }
    pipsEl.innerHTML = html;
  }

  const streakBigEl = document.getElementById('streak-count-big');
  if (streakBigEl) streakBigEl.textContent = streak;

  const streakMsgEl = document.getElementById('streak-msg');
  if (streakMsgEl) {
    const left = bestStreak - streak;
    streakMsgEl.textContent = left > 0
      ? `${left} more day${left !== 1 ? 's' : ''} to beat your best!`
      : streak > 0 ? 'You\'re at your personal best! 🔥' : 'Start your streak today!';
  }

  const streakBestBig = document.getElementById('streak-best-big');
  if (streakBestBig) streakBestBig.textContent = bestStreak + ' days';

  // ── Weekly bars ───────────────────────────────────
  buildWeeklyBars(sessions);

  // ── Subject accuracy from user_attempts ──────────
  _loadSubjectAccuracy();

  // ── Chapter lists from analyticsService ──────────
  _loadChapterLists();

  // ── Aura Score ────────────────────────────────────
  loadAuraScore();
}

// ── Subject accuracy gauges ────────────────────────────
async function _loadSubjectAccuracy() {
  if (!currentUser) return;
  const { data, error } = await db
    .from('user_attempts')
    .select('is_correct, questions!inner(subject)')
    .eq('user_id', currentUser.id);

  if (error || !data) return;

  const subjects = { physics: {t:0,c:0}, chemistry: {t:0,c:0}, mathematics: {t:0,c:0} };
  data.forEach(row => {
    const s = (row.questions?.subject || '').toLowerCase();
    if (subjects[s]) {
      subjects[s].t++;
      if (row.is_correct) subjects[s].c++;
    }
  });

  const colors = { physics: 'var(--accent,#00f0ff)', chemistry: 'var(--purple,#b06aff)', mathematics: 'var(--green,#00e5a0)' };
  const circumference = 263.9;

  Object.entries(subjects).forEach(([subj, {t, c}]) => {
    const pct = t > 0 ? Math.round(c / t * 100) : 0;
    const pctEl  = document.getElementById(`gauge-${subj}-pct`);
    const arcEl  = document.getElementById(`gauge-${subj}-arc`);
    const trendEl= document.getElementById(`gauge-${subj}-trend`);
    const pbBarEl= document.getElementById(`pb-bar-${subj}`);
    const pbPctEl= document.getElementById(`pb-pct-${subj}`);

    if (pctEl)   pctEl.textContent = t > 0 ? pct + '%' : '—';
    if (arcEl)   setTimeout(() => { arcEl.style.strokeDashoffset = circumference - (circumference * pct / 100); }, 100);
    if (trendEl) {
      trendEl.textContent = t > 0 ? `${c}/${t} correct` : 'No attempts yet';
      trendEl.className = 'an-gauge-trend';
    }
    if (pbBarEl) setTimeout(() => { pbBarEl.style.width = pct + '%'; }, 100);
    if (pbPctEl) pbPctEl.textContent = pct + '%';
  });
}

// ── Chapter top/weak lists ─────────────────────────────
async function _loadChapterLists() {
  if (!currentUser) return;

  let report;
  try { report = await getWeaknessReport(currentUser.id); } catch(e) { return; }
  if (!report || !report.length) {
    const topEl  = document.getElementById('top-chapters-list');
    const weakEl = document.getElementById('weak-chapters-list');
    if (topEl)  topEl.innerHTML  = '<div class="an-empty-state">Solve some questions to see stats!</div>';
    if (weakEl) weakEl.innerHTML = '<div class="an-empty-state">Solve some questions to see stats!</div>';
    return;
  }

  // Sort strongest first for top-chapters
  const sorted = [...report].sort((a,b) => b.accuracy - a.accuracy);
  const top5   = sorted.slice(0, 5);
  const weak5  = [...report].slice(0, 5); // already sorted weakest first

  function _chapterRow(item, rank, isWeak) {
    const color  = isWeak
      ? (item.accuracy < 40 ? 'var(--red,#ff4d6a)' : item.accuracy < 55 ? 'var(--orange,#ff9340)' : 'var(--yellow,#ffd060)')
      : (item.accuracy >= 90 ? 'var(--green,#00e5a0)' : 'var(--accent,#00f0ff)');
    const badgeCls = isWeak
      ? (item.accuracy < 40 ? 'an-badge-crit' : item.accuracy < 55 ? 'an-badge-med' : 'an-badge-good')
      : (item.accuracy >= 90 ? 'an-badge-top' : 'an-badge-good');
    const badgeTxt = isWeak
      ? (item.accuracy < 40 ? 'Critical' : item.accuracy < 55 ? 'Medium' : 'Fair')
      : (item.accuracy >= 90 ? '🔥 Hot' : 'Strong');
    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    return `<div class="an-chapter-row">
      <div class="an-chapter-rank ${isWeak ? 'weak' : 'top'}">${rank}</div>
      <div style="flex:1;min-width:0">
        <div class="an-chapter-name">${cap(item.chapter)}</div>
        <div class="an-chapter-sub">${cap(item.subject)} · ${item.total} attempts</div>
      </div>
      <div class="an-chapter-bar-wrap"><div class="an-chapter-bar" style="width:${item.accuracy}%;background:${color}"></div></div>
      <div class="an-chapter-score" style="color:${color}">${item.accuracy}%</div>
      <span class="an-badge-pill ${badgeCls}">${badgeTxt}</span>
    </div>`;
  }

  const topEl  = document.getElementById('top-chapters-list');
  const weakEl = document.getElementById('weak-chapters-list');
  if (topEl)  topEl.innerHTML  = top5.map((c, i) => _chapterRow(c, i+1, false)).join('');
  if (weakEl) weakEl.innerHTML = weak5.map((c, i) => _chapterRow(c, i+1, true)).join('');
}

// ── Aura Score ───────────────────────────────
async function loadAuraScore() {
  const scoreEl  = document.getElementById('aura-score');
  const levelEl  = document.getElementById('aura-level');
  const pctEl    = document.getElementById('aura-percentile');
  const cardEl   = document.getElementById('aura-card');

  if (!scoreEl) return; // aura card not in HTML yet

  // ── Serve from cache if fresh ──────────────
  const now = Date.now();
  if (_auraCacheScore !== null && (now - _auraCacheTime) < AURA_CACHE_TTL_MS) {
    scoreEl.textContent = _auraCacheScore;
    if (levelEl) levelEl.textContent = _auraCacheLevel ?? '';
    if (pctEl && _auraCachePercentile !== null) pctEl.textContent = `Top ${100 - _auraCachePercentile}% of users`;
    return;
  }

  scoreEl.textContent  = '...';
  if (levelEl) levelEl.textContent = '';
  if (pctEl) pctEl.textContent = '';

  try {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return;

    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/calculate-aura`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({}), // no user_id = own aura
    });

    if (!res.ok) return;
    const data = await res.json();

    // ── Populate cache ─────────────────────
    _auraCacheScore      = data.aura_score ?? '—';
    _auraCacheLevel      = data.aura_level ?? '';
    _auraCachePercentile = data.percentile ?? null;
    _auraCacheTime       = Date.now();

    scoreEl.textContent = _auraCacheScore;
    if (levelEl) levelEl.textContent = _auraCacheLevel;
    if (pctEl && _auraCachePercentile !== null) {
      pctEl.textContent = `Top ${100 - _auraCachePercentile}% of users`;
    }

    // Animate the score card
    if (cardEl) {
      cardEl.classList.remove('aura-loaded');
      void cardEl.offsetWidth; // force reflow
      cardEl.classList.add('aura-loaded');
    }

    // Update local profile cache
    if (currentProfile) {
      currentProfile.aura_score = data.aura_score;
      currentProfile.aura_level = data.aura_level;
    }
  } catch (err) {
    console.warn('Aura score load failed:', err);
    if (scoreEl) scoreEl.textContent = '—';
  }
}

function buildWeeklyBars(sessions) {
  const container = document.getElementById('weekly-bars');
  const today = new Date(); today.setHours(0,0,0,0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  const dayTotals = Array(7).fill(0);
  sessions.forEach(s => {
    const d = new Date(s.start_time); d.setHours(0,0,0,0);
    const diff = Math.floor((d - monday) / 86400000);
    if (diff >= 0 && diff < 7) dayTotals[diff] += (s.duration_seconds || 0);
  });

  const max = Math.max(...dayTotals, 1);
  const todayIdx = (today.getDay() + 6) % 7;

  container.innerHTML = dayTotals.map((secs, i) => {
    const pct = Math.round((secs / max) * 100);
    const label = formatDuration(secs) || '0m';
    const isToday = i === todayIdx;
    return '<div class="weekly-bar-wrap"><div class="weekly-bar ' + (isToday ? 'today' : '') +
      '" style="height:' + Math.max(pct, 4) + '%" data-val="' + label + '"></div></div>';
  }).join('');
}

document.querySelectorAll('.accordion-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const content = btn.nextElementSibling;

    // close others (optional, feels cleaner)
    document.querySelectorAll('.accordion-content').forEach(item => {
      if (item !== content) {
        item.style.maxHeight = null;
      }
    });

    // toggle current
    if (content.style.maxHeight) {
      content.style.maxHeight = null;
    } else {
      content.style.maxHeight = content.scrollHeight + "px";
    }
  });
});