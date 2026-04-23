// ============================================
// STUDY AURA — SETTINGS
// ============================================

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

function loadSettingsForm() {
  if (!currentProfile) return;
  document.getElementById('settings-name').value = currentProfile.name || '';
  document.getElementById('settings-class').value = currentProfile.class || '11th';
  document.getElementById('settings-year').value = currentProfile.target_year || '2026';
  document.getElementById('settings-bio').value = currentProfile.bio || '';

  const prev = document.getElementById('settings-avatar-preview');
  if (currentProfile.avatar_url) {
    prev.innerHTML = `<img src="${currentProfile.avatar_url}" alt="avatar">`;
  } else {
    prev.innerHTML = '👤';
    prev.style.fontSize = '2rem';
    prev.style.display = 'flex';
    prev.style.alignItems = 'center';
    prev.style.justifyContent = 'center';
  }

  // Mark current theme active
  const currentTheme = document.body.getAttribute('data-theme') || 'dark';
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === currentTheme);
  });
}

document.getElementById('settings-avatar-input').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('settings-avatar-preview').innerHTML = `<img src="${e.target.result}" alt="avatar">`;
  };
  reader.readAsDataURL(file);
});

document.getElementById('save-settings-btn').addEventListener('click', async () => {
  const name = document.getElementById('settings-name').value.trim();
  const cls = document.getElementById('settings-class').value;
  const year = document.getElementById('settings-year').value;
  const bio = document.getElementById('settings-bio').value.trim();
  const theme = document.body.getAttribute('data-theme') || 'dark';
  const msg = document.getElementById('settings-msg');

  if (!name) { msg.textContent = 'Name is required'; return; }

  const btn = document.getElementById('save-settings-btn');
  btn.textContent = 'Saving...'; btn.disabled = true;

  let avatarUrl = currentProfile.avatar_url;
  const file = document.getElementById('settings-avatar-input').files[0];
  if (file) {
    const ext = file.name.split('.').pop();
    const path = `${currentUser.id}/avatar.${ext}`;
    const { error: upErr } = await db.storage.from('avatars').upload(path, file, { upsert: true });
    if (!upErr) {
      const { data: urlData } = db.storage.from('avatars').getPublicUrl(path);
      avatarUrl = urlData.publicUrl + '?t=' + Date.now();
    }
  }

  const { error } = await db.from('profiles').upsert({
    id: currentUser.id,
    email: currentUser.email,
    name, class: cls, target_year: year, bio,
    avatar_url: avatarUrl,
    theme,
    updated_at: new Date().toISOString()
  });

  btn.textContent = 'Save Changes'; btn.disabled = false;

  if (error) { msg.style.color = 'var(--red)'; msg.textContent = error.message; return; }

  currentProfile = { ...currentProfile, name, class: cls, target_year: year, bio, avatar_url: avatarUrl, theme };
  updateSidebarUI();
  msg.style.color = 'var(--green)';
  msg.textContent = '✅ Profile updated!';
  setTimeout(() => msg.textContent = '', 3000);
});