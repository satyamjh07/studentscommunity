// ============================================
// STUDY AURA — AUTH (v2)
// ============================================

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, duration);
}

// ---- Auth Tabs ----
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab + '-form').classList.add('active');
  });
});

// ---- Sign Up ----
document.getElementById('signup-btn').addEventListener('click', async () => {
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  showError('signup-error', '');

  if (!email || !password) return showError('signup-error', 'Fill in all fields');
  if (password.length < 6) return showError('signup-error', 'Password must be at least 6 characters');

  const btn = document.getElementById('signup-btn');
  btn.textContent = 'Creating...'; btn.disabled = true;

  const { data, error } = await db.auth.signUp({ email, password });
  btn.textContent = 'Create Account'; btn.disabled = false;

  if (error) return showError('signup-error', error.message);
  currentUser = data.user;
  showScreen('onboarding-screen');
});

// ---- Login ----
document.getElementById('login-btn').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  showError('login-error', '');

  if (!email || !password) return showError('login-error', 'Fill in all fields');

  const btn = document.getElementById('login-btn');
  btn.textContent = 'Signing in...'; btn.disabled = true;

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  btn.textContent = 'Sign In'; btn.disabled = false;

  if (error) return showError('login-error', error.message);
  currentUser = data.user;
  await loadUserProfile();
});

// ---- Logout ----
document.getElementById('logout-btn').addEventListener('click', async () => {
  stopTimerClean();
  await db.auth.signOut();
  currentUser = null;
  currentProfile = null;
  showScreen('auth-screen');
});

// ---- Avatar Preview (Onboarding) ----
document.getElementById('avatar-input').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('avatar-preview');
    prev.innerHTML = '<img src="' + e.target.result + '" alt="avatar">';
  };
  reader.readAsDataURL(file);
});

// ---- Save Profile (Onboarding) ----
document.getElementById('save-profile-btn').addEventListener('click', async () => {
  const name = document.getElementById('profile-name').value.trim();
  const cls = document.getElementById('profile-class').value;
  const year = document.getElementById('profile-year').value;
  const bio = document.getElementById('profile-bio').value.trim();
  showError('onboarding-error', '');

  if (!name || !cls || !year) return showError('onboarding-error', 'Name, class, and target year are required');

  const btn = document.getElementById('save-profile-btn');
  btn.textContent = 'Saving...'; btn.disabled = true;

  let avatarUrl = null;
  const file = document.getElementById('avatar-input').files[0];
  if (file) {
    const ext = file.name.split('.').pop();
    const path = currentUser.id + '/avatar.' + ext;
    const { error: upErr } = await db.storage.from('avatars').upload(path, file, { upsert: true });
    if (!upErr) {
      const { data: urlData } = db.storage.from('avatars').getPublicUrl(path);
      avatarUrl = urlData.publicUrl;
    }
  }

  const { error } = await db.from('profiles').upsert({
    id: currentUser.id,
    email: currentUser.email,
    name, class: cls, target_year: year, bio,
    avatar_url: avatarUrl,
    theme: 'dark',
    role: 'member',
    updated_at: new Date().toISOString()
  });

  btn.textContent = 'Save & Continue'; btn.disabled = false;
  if (error) return showError('onboarding-error', error.message);

  await loadUserProfile();
});

// ---- Load Profile & Enter App ----
async function loadUserProfile() {
  const { data: profile } = await db.from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (!profile || !profile.name) {
    showScreen('onboarding-screen');
    return;
  }

  currentProfile = profile;
  applyTheme(profile.theme || 'dark');
  updateSidebarUI();
  showScreen('app-screen');
  goToPage('dashboard');
  loadDashboardData();
  checkUnfinishedSession();
  loadNotificationCount();
}

function updateSidebarUI() {
  if (!currentProfile) return;
  document.getElementById('sidebar-name').textContent = currentProfile.name;
  document.getElementById('sidebar-class').textContent = (currentProfile.class || '') + ' · ' + (currentProfile.target_year || '');

  const avatarHTML = currentProfile.avatar_url
    ? '<img src="' + currentProfile.avatar_url + '" alt="avatar">'
    : '👤';
  document.getElementById('sidebar-avatar-img').innerHTML = avatarHTML;
  document.getElementById('mobile-avatar').innerHTML = currentProfile.avatar_url
    ? '<img src="' + currentProfile.avatar_url + '" alt="av" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
    : '👤';

  // Show admin nav link only for admins
  const adminNavItem = document.getElementById('admin-nav-item');
  if (adminNavItem) {
    adminNavItem.style.display = currentProfile.role === 'admin' ? 'block' : 'none';
  }

  // Legacy admin panels for notifications + whitenoise (keep for backward compat)
  if (currentUser && currentProfile.role === 'admin') {
    const ap = document.getElementById('admin-panel');
    if (ap) ap.style.display = 'block';
    const np = document.getElementById('admin-noise-panel');
    if (np) np.style.display = 'block';
  }
}

// ---- Session check on load ----
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    currentUser = session.user;
    await loadUserProfile();
  } else {
    showScreen('auth-screen');
  }
});