// ============================================
// STUDY AURA — TIMER
// ============================================

let timerInterval = null;
let sessionStartTime = null;
let elapsedSeconds = 0;

const TIMER_KEY = 'sa_timer_start';

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
  // Ring animation — max ring at 2 hours (7200s)
  const circumference = 553;
  const progress = Math.min(seconds / 7200, 1);
  const offset = circumference - (circumference * progress);
  document.getElementById('ring-progress').style.strokeDashoffset = offset;
}

function startTimer() {
  if (timerInterval) return;
  sessionStartTime = new Date().toISOString();
  elapsedSeconds = 0;

  // Persist to localStorage
  localStorage.setItem(TIMER_KEY, sessionStartTime);

  // Save to DB
  saveSessionStart(sessionStartTime);

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
  const duration = elapsedSeconds;

  localStorage.removeItem(TIMER_KEY);

  document.getElementById('timer-start-btn').style.display = 'inline-flex';
  document.getElementById('timer-stop-btn').style.display = 'none';
  document.getElementById('timer-status').textContent = 'Ready';
  document.getElementById('timer-display').textContent = '00:00:00';
  document.getElementById('ring-progress').style.strokeDashoffset = 553;

  // Save session
  await finishSession(sessionStartTime, endTime, duration);
  sessionStartTime = null;
  elapsedSeconds = 0;

  showToast(`✅ Session saved: ${formatDuration(duration)}`);
  loadTodaySessions();
  loadDashboardData();
}

function stopTimerClean() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  localStorage.removeItem(TIMER_KEY);
}

async function saveSessionStart(startTime) {
  if (!currentUser) return;
  await db.from('study_sessions').insert({
    user_id: currentUser.id,
    start_time: startTime,
    status: 'active'
  });
}

async function finishSession(startTime, endTime, duration) {
  if (!currentUser) return;
  await db.from('study_sessions')
    .update({ end_time: endTime, duration_seconds: duration, status: 'complete' })
    .eq('user_id', currentUser.id)
    .eq('start_time', startTime);
}

// ---- Detect unfinished session ----
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
  const duration = window._resumeDiff;
  const endTime = new Date().toISOString();

  localStorage.removeItem(TIMER_KEY);
  document.getElementById('resume-modal').style.display = 'none';

  await finishSession(startTime, endTime, duration);
  showToast(`✅ Session recovered: ${formatDuration(duration)}`);
  loadDashboardData();
}

async function discardSession() {
  localStorage.removeItem(TIMER_KEY);
  document.getElementById('resume-modal').style.display = 'none';

  // Delete the active session from DB
  if (currentUser) {
    await db.from('study_sessions')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('status', 'active');
  }
}

// ---- Load today's sessions ----
async function loadTodaySessions() {
  const list = document.getElementById('sessions-list');
  if (!currentUser) return;

  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);

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

// Called when timer page is opened
function onTimerPageOpen() {
  loadTodaySessions();
}