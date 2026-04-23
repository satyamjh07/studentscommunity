// ============================================
// STUDY AURA — MAIN APP (v2)
// ============================================

// ---- Navigation ----
function goToPage(pageId) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-link")
    .forEach((l) => l.classList.remove("active"));

  const page = document.getElementById("page-" + pageId);
  if (page) page.classList.add("active");

  const link = document.querySelector('.nav-link[data-page="' + pageId + '"]');
  if (link) link.classList.add("active");

  closeMobileSidebar();

  if (pageId === "dashboard") loadDashboardData();
  if (pageId === "timer") onTimerPageOpen();
  if (pageId === "community") loadPosts();
  if (pageId === "whitenoise") onWhitenoisePageOpen();
  if (pageId === "admin") loadAdminPanel();
  if (pageId === "notifications") {
    loadNotifications();
    db.from("notifications")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => {
        localStorage.setItem("sa_notif_seen", count || 0);
        document.getElementById("notif-badge").style.display = "none";
      });
  }
  if (pageId === "settings") loadSettingsForm();
}

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    goToPage(link.dataset.page);
  });
});

// ---- Mobile Sidebar ----
document.getElementById("hamburger").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebar-overlay").classList.toggle("visible");
});
document
  .getElementById("sidebar-overlay")
  .addEventListener("click", closeMobileSidebar);

function closeMobileSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("visible");
}

// ---- Dashboard Data ----
async function loadDashboardData() {
  if (!currentUser) return;

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  document.getElementById("dashboard-greeting").textContent =
    greeting +
    ", " +
    (currentProfile && currentProfile.name
      ? currentProfile.name.split(" ")[0]
      : "friend") +
    "! 🚀";

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);

  const { data: allSessions } = await db
    .from("study_sessions")
    .select("*")
    .eq("user_id", currentUser.id)
    .eq("status", "complete")
    .order("start_time", { ascending: false });

  if (!allSessions) return;

  const todaySessions = allSessions.filter(
    (s) => new Date(s.start_time) >= todayStart,
  );
  const todaySeconds = todaySessions.reduce(
    (a, s) => a + (s.duration_seconds || 0),
    0,
  );
  document.getElementById("today-time").textContent =
    formatDuration(todaySeconds) || "0m";

  const weekSessions = allSessions.filter(
    (s) => new Date(s.start_time) >= weekStart,
  );
  const weekSeconds = weekSessions.reduce(
    (a, s) => a + (s.duration_seconds || 0),
    0,
  );
  document.getElementById("week-time").textContent =
    formatDuration(weekSeconds) || "0h";

  document.getElementById("total-sessions").textContent = allSessions.length;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let checkDate = new Date(today);
  const studyDates = new Set(
    allSessions.map((s) => {
      const d = new Date(s.start_time);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }),
  );
  while (studyDates.has(checkDate.getTime())) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }
  document.getElementById("streak-count").textContent = streak;

  buildWeeklyBars(allSessions);
}

function buildWeeklyBars(sessions) {
  const container = document.getElementById("weekly-bars");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  const dayTotals = Array(7).fill(0);
  sessions.forEach((s) => {
    const d = new Date(s.start_time);
    d.setHours(0, 0, 0, 0);
    const diff = Math.floor((d - monday) / 86400000);
    if (diff >= 0 && diff < 7) dayTotals[diff] += s.duration_seconds || 0;
  });

  const max = Math.max(...dayTotals, 1);
  const todayIdx = (today.getDay() + 6) % 7;

  container.innerHTML = dayTotals
    .map((secs, i) => {
      const pct = Math.round((secs / max) * 100);
      const label = formatDuration(secs) || "0m";
      const isToday = i === todayIdx;
      return (
        '<div class="weekly-bar-wrap"><div class="weekly-bar ' +
        (isToday ? "today" : "") +
        '" style="height:' +
        Math.max(pct, 4) +
        '%" data-val="' +
        label +
        '"></div></div>'
      );
    })
    .join("");
}
