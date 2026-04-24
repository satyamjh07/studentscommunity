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
// TEMP MAIL BLOCKER
// ============================================
const BLOCKED_DOMAINS = new Set([
  // --- Classic disposable ---
  'mailinator.com','guerrillamail.com','guerrillamail.net','guerrillamail.org',
  'guerrillamail.biz','guerrillamail.de','guerrillamail.info','grr.la',
  'sharklasers.com','guerrillamailblock.com','spam4.me','trashmail.com',
  'trashmail.me','trashmail.at','trashmail.io','trashmail.net','trashmail.org',
  'trashmail.xyz','throwam.com','throwam.net','yopmail.com','yopmail.fr',
  'yopmail.net','cool.fr.nf','jetable.fr.nf','nospam.ze.tc','nomail.xl.cx',
  'mega.zik.dj','speed.1s.fr','courriel.fr.nf','moncourrier.fr.nf',
  'monemail.fr.nf','monmail.fr.nf','dispostable.com','discard.email',
  'tempr.email','mailnull.com','mailnull.net','spamgourmet.com',
  'spamgourmet.net','spamgourmet.org','binkmail.com','bob.email',
  'clrmail.com','dcctb.com','getonemail.com','maildrop.cc','mailforspam.com',
  'mailnew.com','mailscrap.com','mailsiphon.com','mailtemp.info',
  'nwldx.com','pookmail.com','shieldedmail.com','spamavert.com',
  'spamevader.com','spamfree24.org','spamgob.com','spamherelots.com',
  'spamhereplease.com','spamspot.com','spamthis.co.uk','temporaryemail.net',
  'throwam.com','wegwerfmail.de','wegwerfmail.net','wegwerfmail.org',
  'tempail.com','tempemail.net','fakeinbox.com','fakeinbox.org',
  'filzmail.com','getairmail.com','gishpuppy.com','hmamail.com',
  'incognitomail.com','incognitomail.net','inoutmail.net','kasmail.com',
  'keepmymail.com','killmail.com','letthemeatspam.com','lol.ovpn.to',
  'lookugly.com','lortemail.dk','m4ilweb.info','mailandftp.com',
  'mailbidon.com','mailbiz.biz','mailblocks.com','mailbucket.org',
  'mailcat.biz','mailcatch.com','mailcdn.com','mailchop.com',
  'mailcker.com','maildu.de','maileater.com','maileimer.de',
  'mailexpire.com','mailfa.tk','mailfall.com','mailfreeonline.com',
  'mailfs.com','mailguard.me','mailguard.net','mailhazard.com',
  'mailhex.com','mailimate.com','mailin8r.com','mailinater.com',
  'mailinator2.com','mailincubator.com','mailismagic.com','mailme.lv',
  'mailme24.com','mailmetrash.com','mailmoat.com','mailnados.com',
  'mailnet.top','mailnew.com','mailninja.co.uk','mailnull.com',
  'mailorg.org','mailpick.biz','mailproxsy.com','mailquack.com',
  'mailrock.biz','mailsac.com','mailscrap.com','mailseal.de',
  'mailsiphon.com','mailslapping.com','mailslite.com','mailss.com',
  'mailsurf.com','mailtemp.info','mailtome.de','mailtothis.com',
  'mailtrash.net','mailtv.net','mailudo.com','mailvnd.com',
  'mailzilla.com','mailzilla.org','mantismails.com','meinspamschutz.de',
  'meltmail.com','messagebeamer.de','mierdamail.com','mintemail.com',
  'moncourrier.fr.nf','monemail.fr.nf','monmail.fr.nf','mt2009.com',
  'mx0.wwwnew.eu','my10minutemail.com','mypartyclip.de','myphantomemail.com',
  'myspaceinc.com','myspaceinc.net','myspaceinc.org','myspacepimpedup.com',
  'myspamless.com','mytempemail.com','netvillageinc.com','netzidiot.de',
  'newbpotato.tk','ninja-spam.at','nospamfor.us','nospamthanks.info',
  'nowmymail.com','ntlhelp.net','objectmail.com','odaymail.com',
  'onewaymail.com','ono.com','otherinbox.com','ourklips.com',
  'outlawspam.com','ovpn.to','owlpic.com','pancakemail.com',
  'pimpedupmyspace.com','pookmail.com','privacy.net','proxymail.eu',
  'prtnx.com','punkass.com','putthisinyourspamdatabase.com',
  'qq.com','recipeforfailure.com','rklips.com','rmqkr.net',
  'rppkn.com','rtrtr.com','s0ny.net','safe-mail.net',
  'safersignup.de','safetymail.info','safetypost.de','sample.com',
  'saynotospams.com','selfdestructingmail.com','sendspamhere.com',
  'sharklasers.com','shieldemail.com','shiftmail.com','shitmail.me',
  'shitmail.org','shitware.nl','shortmail.net','sibmail.com',
  'sneakemail.com','sneakmail.de','snkmail.com','sofimail.com',
  'sofortmail.de','sogetthis.com','soisz.com','spam.la',
  'spam.su','spamavert.com','spambob.com','spambob.net',
  'spambob.org','spambog.com','spambog.de','spambog.ru',
  'spambox.info','spambox.irishspringrealty.com','spambox.us',
  'spamcannon.com','spamcannon.net','spamcero.com','spamcon.org',
  'spamcorptastic.com','spamcowboy.com','spamcowboy.net','spamcowboy.org',
  'spamday.com','spamdecoy.net','spame.com','spamex.com',
  'spamfree.eu','spamfree24.de','spamfree24.eu','spamfree24.info',
  'spamfree24.net','spamfree24.org','spamgob.com','spamgoes.in',
  'spamgourmet.com','spamgourmet.net','spamgourmet.org',
  'spamherelots.com','spamhereplease.com','spamhole.com','spamify.com',
  'spaminmotion.com','spamkill.info','spaml.de','spaml.com',
  'spammotel.com','spamoff.de','spamovore.com','spampoison.com',
  'spamspot.com','spamstack.net','spamthis.co.uk','spamtroll.net',
  'spamwc.de','spamwc.net','spamwc.org','spoofmail.de',
  'stuffmail.de','super-auswahl.de','supergreatmail.com','supermailer.jp',
  'superstachel.de','suremail.info','sweetxxx.de','tafmail.com',
  'tagyourself.com','taximail.me','teewars.org','teleworm.com',
  'teleworm.us','temp-mail.org','temp-mail.ru','temp.emeraldwebmail.com',
  'tempail.com','tempalias.com','tempe.email','tempemail.biz',
  'tempemail.com','tempemail.net','tempinbox.co.uk','tempinbox.com',
  'tempmail.de','tempmail.eu','tempmail.it','tempmail.net',
  'tempmail.pro','tempmail.us','tempmail2.com','tempmailaddress.com',
  'temporaryemail.net','temporaryemail.us','temporaryforwarding.com',
  'temporaryinbox.com','temporarymailaddress.com','thanksnospam.info',
  'thisisnotmyrealemail.com','throwam.com','throwam.net',
  'throwawayemailaddress.com','tilien.com','tittbit.in','tizi.com',
  'tmailinator.com','toiea.com','tradermail.info','trash-amil.com',
  'trash-mail.at','trash-mail.cf','trash-mail.ga','trash-mail.ml',
  'trash-mail.tk','trash2009.com','trash2010.com','trash2011.com',
  'trashdevil.com','trashdevil.de','trashemail.de','trashimail.com',
  'trashmail.at','trashmail.com','trashmail.io','trashmail.me',
  'trashmail.net','trashmail.org','trashmail.xyz','trashmailer.com',
  'trashspam.com','trex294.com','trickmail.net','trillianpro.com',
  'tryalert.com','turual.com','twinmail.de','tyldd.com',
  'uggsrock.com','umail.net','uroid.com','us.af',
  'venompen.com','veryrealemail.com','viditag.com','viewcastmedia.com',
  'viewcastmedia.net','viewcastmedia.org','vkcode.ru','warnme.de',
  'webemail.me','weg-werf-email.de','weide.org','wetrainbayarea.com',
  'wetrainbayarea.org','wh4f.org','whyspam.me','willhackforfood.biz',
  'willselfdestruct.com','winemaven.info','wronghead.com','wuzupmail.net',
  'www.e4ward.com','www.gishpuppy.com','www.mailinator.com',
  'wwwnew.eu','xagloo.com','xemaps.com','xents.com',
  'xmaily.com','xoxy.net','xyzmail.com','yapped.net',
  'yeah.net','yellowjobs.eu','yep.it','yogamaven.com',
  'yomail.info','yopmail.com','yopmail.fr','yopmail.net',
  'yourdomain.com','ypmail.webarnak.fr.eu.org','yuurok.com',
  'z1p.biz','za.com','zehnminuten.de','zehnminutenmail.de',
  'zippymail.info','zoemail.com','zoemail.net','zoemail.org',
  'zolo.com','zomg.info','10minutemail.com','10minutemail.net',
  '10minutemail.org','20minutemail.com','20minutemail.it',
  'mohmal.com','spamgourmet.net','emlpro.com','emltmp.com',
  'inboxbear.com','inboxkitten.com','maildrop.cc','mailnesia.com',
  'nada.email','nada.ltd','tempm.com','tmpmail.net','tmpmail.org',
  'spamwc.com','spamovore.com','discard.email','spamfree.eu',
  'emailondeck.com','burnermail.io','guerrillamail.info',
  'spamgob.net','throwam.org','spamfighter.net',
  'mailnesia.com','vomoto.com'
]);

const ALLOWED_DOMAINS = new Set([
  'gmail.com','yahoo.com','yahoo.in','yahoo.co.in','yahoo.co.uk',
  'yahoo.co.jp','yahoo.de','yahoo.fr','yahoo.es','yahoo.com.br',
  'yahoo.com.au','yahoo.ca','yahoo.it','yahoo.com.ar','yahoo.com.mx',
  'outlook.com','outlook.in','hotmail.com','hotmail.in','hotmail.co.uk',
  'hotmail.fr','hotmail.de','hotmail.es','hotmail.it','live.com',
  'live.in','live.co.uk','live.fr','live.de','msn.com',
  'icloud.com','me.com','mac.com','apple.com',
  'protonmail.com','proton.me','pm.me','protonmail.ch',
  'zoho.com','zohomail.com','zoho.in',
  'rediffmail.com','rediff.com','indiatimes.com','sify.com',
  'aol.com','aim.com','verizon.net','att.net',
  'gmx.com','gmx.net','gmx.de','gmx.at','gmx.ch','gmx.fr',
  'web.de','mail.com','email.com','usa.com','myself.com',
  'tutanota.com','tutamail.com','tuta.io','keemail.me',
  'fastmail.com','fastmail.fm','fastmail.net','fastmail.org',
  'hushmail.com','hush.com','lavabit.com',
  'edu','ac.in','edu.in','nic.in','gov.in','ac.uk','edu.au',
  'rocketmail.com','ymail.com',
  'btinternet.com','virginmedia.com','sky.com','btopenworld.com',
  'talktalk.net','ntlworld.com','o2.co.uk',
  'comcast.net','sbcglobal.net','bellsouth.net','cox.net',
  'charter.net','earthlink.net','optonline.net',
  'mail.ru','inbox.ru','list.ru','bk.ru',
  'yandex.com','yandex.ru','ya.ru',
  'naver.com','daum.net','hanmail.net',
  '163.com','126.com','sina.com','sohu.com',
  'bol.com.br','terra.com.br','uol.com.br',
]);

function getTempMailError(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  // Check against known blocked domains
  if (BLOCKED_DOMAINS.has(domain)) {
    return 'Temporary/disposable email addresses are not allowed. Please use a real email.';
  }

  // Check if the TLD or root domain looks suspicious
  const parts = domain.split('.');
  const tld = parts[parts.length - 1];
  const suspicious = ['tk', 'ml', 'ga', 'cf', 'gq', 'pw', 'top', 'xyz', 'click', 'loan', 'work', 'date', 'racing', 'download', 'stream', 'science', 'accountant', 'party', 'bid', 'trade', 'review', 'cricket', 'win', 'faith', 'men'];
  if (suspicious.includes(tld)) {
    return 'This email domain is not accepted. Please use a trusted email provider.';
  }

  return null;
}

// ---- Live temp-mail check on signup email field ----
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
      if (errEl && errEl.textContent.includes('disposable') || errEl && errEl.textContent.includes('domain')) {
        errEl.textContent = '';
      }
    });
  }
});

// ---- Sign Up ----
document.getElementById('signup-btn').addEventListener('click', async () => {
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  showError('signup-error', '');

  if (!email || !password) return showError('signup-error', 'Fill in all fields');

  const tempMailErr = getTempMailError(email);
  if (tempMailErr) return showError('signup-error', tempMailErr);

  if (password.length < 6) return showError('signup-error', 'Password must be at least 6 characters');

  const btn = document.getElementById('signup-btn');
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
document.getElementById('login-btn').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  showError('login-error', '');

  if (!email || !password) return showError('login-error', 'Fill in all fields');

  const btn = document.getElementById('login-btn');
  btn.textContent = 'Signing in...'; btn.disabled = true;

  const { data, error } = await db.auth.signInWithPassword({ email, password });
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
    await loadUserProfile();
  } else {
    showScreen('auth-screen');
  }
});

// ---- Auth State Change — handles Google OAuth return + password reset ----
db.auth.onAuthStateChange(async (event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    _isPasswordRecoveryFlow = true;
    // Always show the reset screen — never log in automatically
    showScreen('reset-password-screen');
    // Store session user so updateUser() works after submit
    if (session) currentUser = session.user;
    return;
  }

  if (event === 'SIGNED_IN' && session) {
    // If we're in a password-recovery flow, SIGNED_IN fires right after
    // PASSWORD_RECOVERY — ignore it so we don't accidentally log the user in
    // before they've set their new password.
    if (_isPasswordRecoveryFlow) return;

    // Normal Google OAuth redirect return or email confirmation
    if (!currentUser || currentUser.id !== session.user.id) {
      currentUser = session.user;
      await loadUserProfile();
    }
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