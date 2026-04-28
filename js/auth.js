// ============================================
// CUSTOM CONFIRM MODAL (replaces browser confirm())
// ============================================
let _confirmCallback = null;

function showConfirm(title, message, onConfirm, icon) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-icon').textContent = icon || '⚠️';
  _confirmCallback = onConfirm;
  document.getElementById('confirm-modal').style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('confirm-ok-btn').addEventListener('click', () => {
    document.getElementById('confirm-modal').style.display = 'none';
    if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
  });
  document.getElementById('confirm-cancel-btn').addEventListener('click', () => {
    document.getElementById('confirm-modal').style.display = 'none';
    _confirmCallback = null;
  });
});

// ============================================
// STUDY AURA — AUTH (v3 — Google + PW toggle + Forgot PW + Email confirm)
// ============================================

let _pendingConfirmEmail = '';

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
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

// ---- Password Visibility Toggle ----
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.pw-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.querySelector('.eye-show').style.display = isHidden ? 'none' : '';
      btn.querySelector('.eye-hide').style.display = isHidden ? '' : 'none';
    });
  });
});

// ---- Google OAuth ----
document.addEventListener('DOMContentLoaded', () => {
  const googleBtn = document.getElementById('google-auth-btn');
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      googleBtn.disabled = true;
      googleBtn.textContent = 'Redirecting…';
      const { error } = await db.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname }
      });
      if (error) {
        showToast('Google sign-in failed: ' + error.message);
        googleBtn.disabled = false;
        googleBtn.textContent = 'Continue with Google';
      }
    });
  }
});

// ============================================
// EMAIL DOMAIN ALLOWLIST
// Only the 5 most popular trusted email providers are accepted.
// ============================================
const ALLOWED_DOMAINS = new Set([
  'gmail.com',      // Google  — #1 worldwide
  'outlook.com',    // Microsoft Outlook
  'hotmail.com',    // Microsoft Hotmail (legacy, still widely used)
  'yahoo.com',      // Yahoo Mail
  'icloud.com',     // Apple iCloud Mail
]);

function getTempMailError(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  if (!ALLOWED_DOMAINS.has(domain)) {
    return 'Only popular email providers are accepted: Gmail, Outlook, Hotmail, Yahoo, or iCloud.';
  }

  return null;
}

// ---- Live email domain check on signup email field ----
document.addEventListener('DOMContentLoaded', () => {
  const signupEmailInput = document.getElementById('signup-email');
  if (signupEmailInput) {
    signupEmailInput.addEventListener('blur', () => {
      const email = signupEmailInput.value.trim();
      if (!email || !email.includes('@')) return;
      const err = getTempMailError(email);
      showError('signup-error', err || '');
    });
    signupEmailInput.addEventListener('input', () => {
      // Clear the error while the user is typing so it doesn't feel naggy
      const errEl = document.getElementById('signup-error');
      if (errEl && errEl.textContent.includes('popular email providers')) {
        errEl.textContent = '';
      }
    });
  }
});

// ---- Sign Up ----
const _signupBtn = document.getElementById('signup-btn');
if (_signupBtn) _signupBtn.addEventListener('click', async () => {
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  showError('signup-error', '');

  if (!email || !password) return showError('signup-error', 'Fill in all fields');

  const tempMailErr = getTempMailError(email);
  if (tempMailErr) return showError('signup-error', tempMailErr);

  if (password.length < 6) return showError('signup-error', 'Password must be at least 6 characters');

  const btn = _signupBtn;
  btn.textContent = 'Creating...'; btn.disabled = true;

  // Retry up to 2 times on network/gateway timeout errors
  let data, error;
  for (let attempt = 1; attempt <= 2; attempt++) {
    ({ data, error } = await db.auth.signUp({ email, password }));
    if (!error) break;
    const isTimeout = error.status === 504 || error.status === 502 ||
      (error.message && (error.message.includes('timeout') || error.message.includes('Gateway')));
    if (isTimeout && attempt < 2) {
      btn.textContent = 'Retrying...';
      await new Promise(r => setTimeout(r, 2000));
      btn.textContent = 'Creating...';
    } else {
      break;
    }
  }

  btn.textContent = 'Create Account'; btn.disabled = false;

  if (error) {
    const isTimeout = error.status === 504 || error.status === 502 ||
      (error.message && (error.message.includes('timeout') || error.message.includes('Gateway')));
    if (isTimeout) {
      return showError('signup-error', 'Server is slow right now. Please try again in a moment.');
    }
    return showError('signup-error', error.message);
  }

  // email_confirmed_at is null → Supabase requires email confirmation
  if (data.user && !data.user.email_confirmed_at) {
    _pendingConfirmEmail = email;
    document.getElementById('confirm-email-desc').textContent =
      `We sent a confirmation link to ${email}. Click it to activate your account, then come back here and sign in.`;
    showScreen('confirm-email-screen');
    return;
  }

  // Auto-confirmed (email confirmations disabled in Supabase settings)
  currentUser = data.user;
  showScreen('onboarding-screen');
});

// ---- Login ----
const _loginBtn = document.getElementById('login-btn');
if (_loginBtn) _loginBtn.addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  showError('login-error', '');

  if (!email || !password) return showError('login-error', 'Fill in all fields');

  const btn = _loginBtn;
  btn.textContent = 'Signing in...'; btn.disabled = true;

  let data, error;
  try {
    ({ data, error } = await db.auth.signInWithPassword({ email, password }));
  } catch (e) {
    btn.textContent = 'Sign In'; btn.disabled = false;
    return showError('login-error', 'Network error — please try again.');
  }
  btn.textContent = 'Sign In'; btn.disabled = false;

  if (error) {
    if (error.message && error.message.toLowerCase().includes('email not confirmed')) {
      _pendingConfirmEmail = email;
      document.getElementById('confirm-email-desc').textContent =
        `Your email (${email}) hasn't been confirmed yet. Check your inbox or resend below.`;
      showScreen('confirm-email-screen');
      return;
    }
    return showError('login-error', error.message);
  }

  if (data && data.user) {
    currentUser = data.user;
    await loadUserProfile();
  }
});

// ---- Logout ----
const _logoutBtn = document.getElementById('logout-btn');
if (_logoutBtn) _logoutBtn.addEventListener('click', async () => {
  stopTimerClean();
  await db.auth.signOut();
  currentUser = null;
  currentProfile = null;
  showScreen('auth-screen');
});

// ---- Forgot Password ----
document.addEventListener('DOMContentLoaded', () => {
  const forgotLink = document.getElementById('forgot-password-link');
  if (forgotLink) {
    forgotLink.addEventListener('click', e => {
      e.preventDefault();
      const emailVal = document.getElementById('login-email').value.trim();
      if (emailVal) document.getElementById('forgot-email').value = emailVal;
      document.getElementById('forgot-step-request').style.display = '';
      document.getElementById('forgot-step-done').style.display = 'none';
      document.getElementById('forgot-msg').textContent = '';
      showScreen('forgot-password-screen');
    });
  }

  const backFromForgot = document.getElementById('back-to-login-from-forgot');
  if (backFromForgot) {
    backFromForgot.addEventListener('click', e => { e.preventDefault(); showScreen('auth-screen'); });
  }

  const sendResetBtn = document.getElementById('send-reset-btn');
  if (sendResetBtn) {
    sendResetBtn.addEventListener('click', async () => {
      const email = document.getElementById('forgot-email').value.trim();
      const msgEl = document.getElementById('forgot-msg');
      msgEl.textContent = '';
      msgEl.style.color = 'var(--red)';

      if (!email) { msgEl.textContent = 'Please enter your email.'; return; }

      sendResetBtn.textContent = 'Sending...'; sendResetBtn.disabled = true;

      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });

      sendResetBtn.textContent = 'Send Reset Link'; sendResetBtn.disabled = false;

      if (error) { msgEl.textContent = error.message; return; }

      document.getElementById('forgot-step-request').style.display = 'none';
      document.getElementById('forgot-step-done').style.display = '';
    });
  }
});

// ---- Email Confirm Screen — Resend & Back ----
document.addEventListener('DOMContentLoaded', () => {
  const resendBtn = document.getElementById('resend-confirm-btn');
  if (resendBtn) {
    resendBtn.addEventListener('click', async () => {
      if (!_pendingConfirmEmail) return;
      resendBtn.disabled = true;
      resendBtn.textContent = 'Sending…';
      const { error } = await db.auth.resend({ type: 'signup', email: _pendingConfirmEmail });
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend Email';
      const msgEl = document.getElementById('resend-msg');
      if (error) {
        msgEl.style.color = 'var(--red)';
        msgEl.textContent = error.message;
      } else {
        msgEl.style.color = 'var(--green)';
        msgEl.textContent = '✅ Email resent! Check your inbox.';
      }
    });
  }

  const backToLogin = document.getElementById('back-to-login-link');
  if (backToLogin) {
    backToLogin.addEventListener('click', e => { e.preventDefault(); showScreen('auth-screen'); });
  }
});

// ---- Avatar Preview (Onboarding) ----
const _avatarInput = document.getElementById('avatar-input');
if (_avatarInput) _avatarInput.addEventListener('change', function () {
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
const _saveProfileBtn = document.getElementById('save-profile-btn');
if (_saveProfileBtn) _saveProfileBtn.addEventListener('click', async () => {
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
  checkUnfinishedSession();
  // Delay notification count fetch slightly to ensure RLS session cookie is set
  setTimeout(() => { if (currentUser) loadNotificationCount(); }, 800);
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

  const adminNavItem = document.getElementById('admin-nav-item');
  if (adminNavItem) {
    adminNavItem.style.display = currentProfile.role === 'admin' ? 'block' : 'none';
  }

  if (currentUser && currentProfile.role === 'admin') {
    const ap = document.getElementById('admin-panel');
    if (ap) ap.style.display = 'block';
    const np = document.getElementById('admin-noise-panel');
    if (np) np.style.display = 'block';
  }
}

// ---- Session check on load ----
// Check URL hash FIRST — if this is a password reset redirect, hand off
// entirely to onAuthStateChange and do nothing else.
let _isPasswordRecoveryFlow = false;

// BUG FIX: Track whether the initial session load has already run.
// This prevents onAuthStateChange from calling loadUserProfile() a
// second time if it fires SIGNED_IN after DOMContentLoaded already
// restored the session via getSession(). Without this guard, Google
// OAuth users get a double-load race that can show the auth screen.
let _initialSessionHandled = false;

(function detectRecoveryFlow() {
  const hash = window.location.hash;
  if (hash && hash.includes('type=recovery')) {
    _isPasswordRecoveryFlow = true;
    // Clean the URL so a refresh doesn't re-trigger this
    history.replaceState(null, '', window.location.pathname);
  }
})();

window.addEventListener('DOMContentLoaded', async () => {
  // If this page load came from a password-reset email link,
  // don't log the user in — wait for onAuthStateChange to fire PASSWORD_RECOVERY.
  if (_isPasswordRecoveryFlow) {
    showScreen('reset-password-screen');
    return;
  }

  const { data: { session } } = await db.auth.getSession();
  if (session) {
    currentUser = session.user;
    _initialSessionHandled = true;
    await loadUserProfile();
  } else {
    showScreen('auth-screen');
  }
});

// ---- Auth State Change ----
// Handles: Google OAuth redirect return, token refresh, password reset.
//
// BUG FIX (Google OAuth logout on refresh):
//
// Root cause: The previous handler only processed SIGNED_IN for non-email
// providers, but it did NOT handle TOKEN_REFRESHED. When a Google OAuth
// access token expires (~1 hour), Supabase silently refreshes it in the
// background and fires TOKEN_REFRESHED. Because this event was ignored,
// the in-memory `currentUser` stayed valid but any subsequent authenticated
// fetch would get a 401. On the next hard refresh, getSession() in
// DOMContentLoaded correctly restores the session — but a race condition
// exists: if onAuthStateChange fires SIGNED_IN before DOMContentLoaded
// finishes its async getSession() call (which can happen on slow
// connections or after an OAuth redirect), loadUserProfile() gets called
// twice. The second call finds `currentUser` unset and shows the auth
// screen.
//
// Fix:
//   1. Handle TOKEN_REFRESHED — update currentUser so tokens stay fresh.
//   2. Use _initialSessionHandled to skip SIGNED_IN events that are
//      redundant with what DOMContentLoaded already handled.
//   3. Keep the email/password path unchanged (handled in the login button).

db.auth.onAuthStateChange(async (event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    _isPasswordRecoveryFlow = true;
    showScreen('reset-password-screen');
    if (session) currentUser = session.user;
    return;
  }

  // BUG FIX: Keep currentUser up-to-date when Supabase silently refreshes
  // a Google OAuth token. Without this, API calls made after token expiry
  // use a stale token and fail with 401, making it appear the user is
  // logged out even though getSession() would return a valid session.
  if (event === 'TOKEN_REFRESHED' && session) {
    currentUser = session.user;
    return;
  }

  if (event === 'SIGNED_IN' && session) {
    if (_isPasswordRecoveryFlow) return;

    // BUG FIX: If DOMContentLoaded already handled this session (e.g. the
    // user refreshed the page and getSession() found a stored session),
    // skip loading the profile again. This prevents the double-load race
    // where the second call sees currentUser not yet assigned and shows
    // the auth screen over a valid session.
    //
    // We reset _initialSessionHandled after consuming it once so that
    // future SIGNED_IN events (e.g. the user logs out and back in) are
    // processed normally.
    if (_initialSessionHandled) {
      _initialSessionHandled = false;
      return;
    }

    // Only handle OAuth providers here (email/password login sets
    // currentUser and calls loadUserProfile() directly in the login button
    // handler, so handling it here too would cause a duplicate profile load).
    const provider = session.user?.app_metadata?.provider;
    if (provider && provider !== 'email') {
      currentUser = session.user;
      await loadUserProfile();
    }
  }

  if (event === 'SIGNED_OUT') {
    currentUser = null;
    currentProfile = null;
    _initialSessionHandled = false;
  }
});

// ---- Reset Password Screen ----
document.addEventListener('DOMContentLoaded', () => {
  const resetBtn = document.getElementById('reset-pw-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const newPass = document.getElementById('reset-new-password').value;
      const confirmPass = document.getElementById('reset-confirm-password').value;
      const errEl = document.getElementById('reset-pw-error');
      errEl.textContent = '';

      if (!newPass || !confirmPass) return (errEl.textContent = 'Please fill in both fields.');
      if (newPass.length < 6) return (errEl.textContent = 'Password must be at least 6 characters.');
      if (newPass !== confirmPass) return (errEl.textContent = 'Passwords do not match.');

      resetBtn.textContent = 'Updating…';
      resetBtn.disabled = true;

      const { data, error } = await db.auth.updateUser({ password: newPass });

      resetBtn.textContent = 'Update Password';
      resetBtn.disabled = false;

      if (error) { errEl.textContent = error.message; return; }

      document.getElementById('reset-pw-success').style.display = '';
      resetBtn.style.display = 'none';
      document.getElementById('reset-new-password').value = '';
      document.getElementById('reset-confirm-password').value = '';

      // Password updated — clear the recovery flag so the next SIGNED_IN
      // event (fired by updateUser) is allowed to load the user profile.
      _isPasswordRecoveryFlow = false;
      currentUser = data.user;
      setTimeout(async () => {
        await loadUserProfile();
      }, 1800);
    });
  }

  // Re-apply pw-toggle to reset screen inputs after DOM ready
  document.querySelectorAll('.pw-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.querySelector('.eye-show').style.display = isHidden ? 'none' : '';
      btn.querySelector('.eye-hide').style.display = isHidden ? '' : 'none';
    });
  });
});