// ============================================
// STUDY AURA — TIMER (v4 — Drift-Free)
// BUG FIX: Timer display now uses wall-clock
// difference from sessionStartTime on every tick,
// instead of incrementing elapsedSeconds by 1.
// This means tab-backgrounding, page switches,
// and setInterval jitter can NEVER cause the
// display to lag behind the real elapsed time.
// ============================================

let timerInterval = null;
let sessionStartTime = null;   // ISO string — the ground truth
let elapsedSeconds = 0;        // only kept for stopTimer fallback display

const TIMER_KEY = 'sa_timer_start';

// ── Edge Function base URL ──────────────────
const EDGE_BASE = window.SUPABASE_URL || 'https://biqdrsqirzxnznyucwtz.supabase.co';

// Helper: call an Edge Function with the user's JWT
async function callEdge(fnName, body) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`${EDGE_BASE}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + session.access_token,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Edge Function error');
  return json;
}

// ────────────────────────────────────────────
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function updateTimerUI(seconds) {
  document.getElementById('timer-display').textContent = formatTime(seconds);
  const circumference = 553;
  const progress = Math.min(seconds / 7200, 1);
  const offset = circumference - (circumference * progress);
  document.getElementById('ring-progress').style.strokeDashoffset = offset;
}

// ── FIX: Compute elapsed from wall-clock, not a counter ──────────────
// Previously: elapsedSeconds++ every 1000ms → drifts when tab is
// backgrounded, device is busy, or user navigates away and back.
// Now: elapsed = Math.floor((Date.now() - startTimestamp) / 1000)
// This is always accurate, no matter what the browser does to the interval.
function _getElapsedSeconds() {
  if (!sessionStartTime) return 0;
  return Math.floor((Date.now() - new Date(sessionStartTime).getTime()) / 1000);
}

function startTimer() {
  if (timerInterval) return;
  sessionStartTime = new Date().toISOString();
  elapsedSeconds = 0;

  localStorage.setItem(TIMER_KEY, sessionStartTime);
  saveSessionStart(sessionStartTime); // mark as 'active' in DB

  document.getElementById('timer-start-btn').style.display = 'none';
  document.getElementById('timer-stop-btn').style.display = 'inline-flex';
  document.getElementById('timer-status').textContent = 'Studying...';

  // Tick every 500ms so we never visually skip a second, but always
  // read the real wall-clock elapsed time — never a drifting counter.
  timerInterval = setInterval(() => {
    const elapsed = _getElapsedSeconds();
    updateTimerUI(elapsed);
  }, 500);
}

async function stopTimer() {
  if (!timerInterval) return;
  clearInterval(timerInterval);
  timerInterval = null;

  const endTime = new Date().toISOString();
  // Wall-clock duration for fallback display (server is authoritative)
  const localDuration = _getElapsedSeconds();

  localStorage.removeItem(TIMER_KEY);

  document.getElementById('timer-start-btn').style.display = 'inline-flex';
  document.getElementById('timer-stop-btn').style.display = 'none';
  document.getElementById('timer-status').textContent = 'Ready';
  document.getElementById('timer-display').textContent = '00:00:00';
  document.getElementById('ring-progress').style.strokeDashoffset = 553;

  // ── SECURE: Send to Edge Function — no duration from frontend ──────
  try {
    const result = await callEdge('save-session', {
      start_time: sessionStartTime,
      end_time: endTime,
      // ⚠️ DO NOT send duration_seconds — server computes it
    });
    const saved = result.duration_seconds || localDuration;
    showToast(`✅ Session saved: ${formatDuration(saved)}`);
  } catch (err) {
    showToast('⚠️ Could not save session: ' + err.message);
    console.error('save-session error:', err);
  }

  sessionStartTime = null;
  elapsedSeconds = 0;

  loadTodaySessions();
  loadDashboardData({ skipAura: true });
}

function stopTimerClean() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  localStorage.removeItem(TIMER_KEY);
}

// ── Save 'active' marker to DB ───────────────────────────────────────
async function saveSessionStart(startTime) {
  if (!currentUser) return;
  await db.from('study_sessions').insert({
    user_id: currentUser.id,
    start_time: startTime,
    status: 'active'
  });
}

// ── Recover unfinished session ───────────────────────────────────────
async function checkUnfinishedSession() {
  const storedStart = localStorage.getItem(TIMER_KEY);
  if (!storedStart) return;

  const startDate = new Date(storedStart);
  const now = new Date();
  const diffSeconds = Math.floor((now - startDate) / 1000);

  const modal = document.getElementById('resume-modal');
  const info = document.getElementById('resume-info');
  info.textContent = `Started: ${startDate.toLocaleTimeString()} · Elapsed: ${formatDuration(diffSeconds)}`;
  modal.style.display = 'flex';

  window._resumeStart = storedStart;
  window._resumeDiff = diffSeconds;
}

async function resumeSession() {
  const startTime = window._resumeStart;
  const endTime = new Date().toISOString();

  localStorage.removeItem(TIMER_KEY);
  document.getElementById('resume-modal').style.display = 'none';

  try {
    const result = await callEdge('save-session', {
      start_time: startTime,
      end_time: endTime,
    });
    const saved = result.duration_seconds;
    showToast(`✅ Session recovered: ${formatDuration(saved)}`);
  } catch (err) {
    showToast('⚠️ Could not recover session: ' + err.message);
  }

  loadDashboardData({ skipAura: true });
}

async function discardSession() {
  localStorage.removeItem(TIMER_KEY);
  document.getElementById('resume-modal').style.display = 'none';

  if (currentUser) {
    await db.from('study_sessions')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('status', 'active');
  }
}

// ── Load today's sessions ────────────────────────────────────────────
async function loadTodaySessions() {
  const list = document.getElementById('sessions-list');
  if (!currentUser) return;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data } = await db.from('study_sessions')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('status', 'complete')
    .gte('start_time', todayStart.toISOString())
    .order('start_time', { ascending: false });

  if (!data || data.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">◷</div>No sessions yet today</div>';
    return;
  }

  list.innerHTML = data.map(s => {
    const start = new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const end = s.end_time ? new Date(s.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="session-item">
      <span class="session-time">${start}${end ? ' → ' + end : ''}</span>
      <span class="session-duration">${formatDuration(s.duration_seconds || 0)}</span>
    </div>`;
  }).join('');
}

// ── FIX: Restore live display when user navigates back to timer page ─
// Previously onTimerPageOpen() only loaded session history.
// If a session is running, the display was frozen at wherever it was
// when the user left. Now we restart the display interval correctly.
function onTimerPageOpen() {
  loadTodaySessions();

  // If a session is already running (user navigated away and came back),
  // re-sync the display immediately and restart the interval.
  const storedStart = localStorage.getItem(TIMER_KEY);
  if (storedStart && !timerInterval) {
    // Re-attach the in-memory start time in case it was lost
    if (!sessionStartTime) sessionStartTime = storedStart;

    // Show correct elapsed immediately (no waiting for first tick)
    updateTimerUI(_getElapsedSeconds());

    document.getElementById('timer-start-btn').style.display = 'none';
    document.getElementById('timer-stop-btn').style.display = 'inline-flex';
    document.getElementById('timer-status').textContent = 'Studying...';

    timerInterval = setInterval(() => {
      updateTimerUI(_getElapsedSeconds());
    }, 500);
  }
}
