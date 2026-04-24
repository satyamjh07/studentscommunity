// ============================================
// STUDY AURA — TIMER (v3 — Secure)
// Duration is computed SERVER-SIDE via Edge Function.
// Frontend only sends start_time + end_time.
// ============================================

let timerInterval = null;
let sessionStartTime = null;
let elapsedSeconds = 0;

const TIMER_KEY = 'sa_timer_start';

// ── Edge Function base URL ──────────────────
// Replace with your actual Supabase project URL if different
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

function startTimer() {
  if (timerInterval) return;
  sessionStartTime = new Date().toISOString();
  elapsedSeconds = 0;

  localStorage.setItem(TIMER_KEY, sessionStartTime);
  saveSessionStart(sessionStartTime); // mark as 'active' in DB

  document.getElementById('timer-start-btn').style.display = 'none';
  document.getElementById('timer-stop-btn').style.display = 'inline-flex';
  document.getElementById('timer-status').textContent = 'Studying...';

  timerInterval = setInterval(() => {
    elapsedSeconds++;
    updateTimerUI(elapsedSeconds);
  }, 1000);
}

async function stopTimer() {
  if (!timerInterval) return;
  clearInterval(timerInterval);
  timerInterval = null;

  const endTime = new Date().toISOString();
  const localDuration = elapsedSeconds; // for UI display only

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
  loadDashboardData({ skipAura: true }); // aura only changes daily, skip the Edge Function call
}

function stopTimerClean() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  localStorage.removeItem(TIMER_KEY);
}

// ── Save 'active' marker to DB (unchanged from v2) ──────────────────
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

  // ── SECURE: Use Edge Function for recovery too ───────────────────
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

// ── Load today's sessions (unchanged) ────────────────────────────────
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

function onTimerPageOpen() {
  loadTodaySessions();
}