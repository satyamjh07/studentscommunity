// ============================================
// STUDY AURA — CLOUDINARY PROFILE IMAGE PATCH
// Drop-in replacement for avatar upload logic
// in both onboarding (auth.js) and settings.js
// ============================================

// ── ONBOARDING: Avatar upload ─────────────────
// Replace the avatar-input change handler in auth.js with this block.
// Paste it AFTER cloudinary.js is loaded.

(function patchOnboardingAvatar() {
  const avatarInput = document.getElementById('avatar-input');
  const avatarPreview = document.getElementById('avatar-preview');

  if (!avatarInput) return; // Not on onboarding screen

  avatarInput.addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;

    // Validate immediately and show preview
    if (!file.type.startsWith('image/')) {
      showToast('❌ Only image files allowed');
      this.value = '';
      return;
    }
    if (file.size > 1 * 1024 * 1024) {
      showToast('❌ Image must be under 1MB');
      this.value = '';
      return;
    }

    // Show local preview instantly
    createImagePreview(file, avatarPreview);
  });
})();

// ── SETTINGS: Avatar upload ───────────────────
(function patchSettingsAvatar() {
  const settingsInput = document.getElementById('settings-avatar-input');
  const settingsPreview = document.getElementById('settings-avatar-preview');

  if (!settingsInput) return;

  settingsInput.addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('❌ Only image files allowed');
      this.value = '';
      return;
    }
    if (file.size > 1 * 1024 * 1024) {
      showToast('❌ Image must be under 1MB');
      this.value = '';
      return;
    }

    createImagePreview(file, settingsPreview);
  });
})();

// ============================================================
// PATCHED: getAvatarUrl
// Replaces any direct avatar_url usage in profile save with
// a Cloudinary upload first. Call this in your save handlers.
// ============================================================

/**
 * Uploads avatar to Cloudinary if a new file was selected.
 * Returns the optimized secure_url, or the existing url if no file.
 *
 * @param {HTMLInputElement} fileInput - The file input element
 * @param {string|null} existingUrl - Current avatar URL from profile
 * @param {HTMLElement} [progressContainer] - Optional element for progress bar
 * @returns {Promise<string|null>} Cloudinary URL or null
 */
async function uploadAvatarIfChanged(fileInput, existingUrl = null, progressContainer = null) {
  const file = fileInput && fileInput.files[0];
  if (!file) return existingUrl; // No new file — keep existing

  try {
    showUploadProgress(progressContainer, 0);

    const secureUrl = await uploadImageToCloudinary(file, {
      maxSizeMB: 1,
      folder: 'study_aura/avatars',
      onProgress: (pct) => showUploadProgress(progressContainer, pct),
    });

    showUploadProgress(progressContainer, null);
    return getOptimizedUrl(secureUrl, 'w_200,h_200,c_fill,g_face');

  } catch (err) {
    showUploadProgress(progressContainer, null);
    throw err; // Re-throw so caller can handle
  }
}

// ============================================================
// PATCHED ONBOARDING SAVE (replaces save-profile-btn handler)
// Copy this into auth.js or a separate patch file loaded AFTER auth.js
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const saveProfileBtn = document.getElementById('save-profile-btn');
  if (!saveProfileBtn) return;

  // Remove old listener by cloning the button
  const newBtn = saveProfileBtn.cloneNode(true);
  saveProfileBtn.parentNode.replaceChild(newBtn, saveProfileBtn);

  newBtn.addEventListener('click', async () => {
    const name = document.getElementById('profile-name').value.trim();
    const cls  = document.getElementById('profile-class').value;
    const year = document.getElementById('profile-year').value;
    const bio  = document.getElementById('profile-bio').value.trim();
    showError('onboarding-error', '');

    if (!name || !cls || !year)
      return showError('onboarding-error', 'Name, class, and target year are required');

    newBtn.textContent = 'Uploading...'; newBtn.disabled = true;

    try {
      const fileInput = document.getElementById('avatar-input');
      const progressEl = document.getElementById('onboarding-upload-progress');

      // ── Upload avatar to Cloudinary ────────────
      let avatarUrl = null;
      if (fileInput && fileInput.files[0]) {
        avatarUrl = await uploadAvatarIfChanged(fileInput, null, progressEl);
      }

      newBtn.textContent = 'Saving...';

      // ── Save profile to Supabase ───────────────
      const { error } = await db.from('profiles').upsert({
        id: currentUser.id,
        email: currentUser.email,
        name, class: cls, target_year: year, bio,
        avatar_url: avatarUrl,         // Cloudinary URL stored here
        theme: 'dark',
        role: 'member',
        updated_at: new Date().toISOString()
      });

      if (error) {
        showError('onboarding-error', error.message);
        return;
      }

      await loadUserProfile();

    } catch (err) {
      showError('onboarding-error', '❌ ' + err.message);
    } finally {
      newBtn.textContent = 'Save & Continue';
      newBtn.disabled = false;
    }
  });
});

// ============================================================
// PATCHED SETTINGS SAVE (replaces save-settings-btn handler)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  if (!saveSettingsBtn) return;

  const newBtn = saveSettingsBtn.cloneNode(true);
  saveSettingsBtn.parentNode.replaceChild(newBtn, saveSettingsBtn);

  newBtn.addEventListener('click', async () => {
    const name  = document.getElementById('settings-name').value.trim();
    const cls   = document.getElementById('settings-class').value;
    const year  = document.getElementById('settings-year').value;
    const bio   = document.getElementById('settings-bio').value.trim();
    const theme = document.body.getAttribute('data-theme') || 'dark';
    const msg   = document.getElementById('settings-msg');

    if (!name) { msg.textContent = 'Name is required'; return; }

    newBtn.textContent = 'Uploading...'; newBtn.disabled = true;
    msg.textContent = '';

    try {
      const fileInput  = document.getElementById('settings-avatar-input');
      const progressEl = document.getElementById('settings-upload-progress');

      // ── Upload new avatar if selected ──────────
      let avatarUrl = currentProfile ? currentProfile.avatar_url : null;
      if (fileInput && fileInput.files[0]) {
        avatarUrl = await uploadAvatarIfChanged(fileInput, avatarUrl, progressEl);
      }

      newBtn.textContent = 'Saving...';

      const { error } = await db.from('profiles').upsert({
        id: currentUser.id,
        email: currentUser.email,
        name, class: cls, target_year: year, bio,
        avatar_url: avatarUrl,
        theme,
        updated_at: new Date().toISOString()
      });

      if (error) {
        msg.style.color = 'var(--red)';
        msg.textContent = error.message;
        return;
      }

      currentProfile = { ...currentProfile, name, class: cls, target_year: year, bio, avatar_url: avatarUrl, theme };
      updateSidebarUI();
      msg.style.color = 'var(--green)';
      msg.textContent = '✅ Profile updated!';
      setTimeout(() => msg.textContent = '', 3000);

    } catch (err) {
      msg.style.color = 'var(--red)';
      msg.textContent = '❌ ' + err.message;
    } finally {
      newBtn.textContent = 'Save Changes';
      newBtn.disabled = false;
    }
  });
});