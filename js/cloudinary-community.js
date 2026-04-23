// ============================================
// STUDY AURA — CLOUDINARY COMMUNITY POST PATCH
// Adds optional image upload to community posts.
// Extends existing create-post Edge Function call.
// ============================================

// ── State ──────────────────────────────────────
let _pendingPostImageUrl = null; // Cloudinary URL after upload

// ============================================================
// POST IMAGE UPLOAD — triggered when user picks an image
// ============================================================
function initPostImageUpload() {
  const imageInput = document.getElementById('post-image-input');
  const imagePreview = document.getElementById('post-image-preview');
  const removeBtn = document.getElementById('post-image-remove-btn');
  const progressEl = document.getElementById('post-image-progress');

  if (!imageInput) return;

  imageInput.addEventListener('change', async function () {
    const file = this.files[0];
    if (!file) return;

    // Validate
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

    // Show local preview immediately
    if (imagePreview) createImagePreview(file, imagePreview);
    if (imagePreview) imagePreview.style.display = 'block';
    if (removeBtn) removeBtn.style.display = 'inline-flex';

    // Upload to Cloudinary
    try {
      showUploadProgress(progressEl, 0);

      const secureUrl = await uploadImageToCloudinary(file, {
        maxSizeMB: 1,
        folder: 'study_aura/posts',
        onProgress: (pct) => showUploadProgress(progressEl, pct),
      });

      _pendingPostImageUrl = getOptimizedUrl(secureUrl, 'w_800,q_auto,f_auto');
      showUploadProgress(progressEl, null);
      showToast('✅ Image ready!');

    } catch (err) {
      showUploadProgress(progressEl, null);
      showToast('❌ Upload failed: ' + err.message);
      _pendingPostImageUrl = null;
      if (imagePreview) { imagePreview.innerHTML = ''; imagePreview.style.display = 'none'; }
      if (removeBtn) removeBtn.style.display = 'none';
      this.value = '';
    }
  });

  // Remove button clears the image
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      _pendingPostImageUrl = null;
      if (imageInput) imageInput.value = '';
      if (imagePreview) { imagePreview.innerHTML = ''; imagePreview.style.display = 'none'; }
      removeBtn.style.display = 'none';
      showUploadProgress(progressEl, null);
    });
  }
}

// ============================================================
// PATCHED POST SUBMIT — replaces post-btn click handler
// Sends { content, image_url } to create-post Edge Function
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initPostImageUpload();

  const postBtn = document.getElementById('post-btn');
  if (!postBtn) return;

  // Clone to remove the old listener from community.js
  const newBtn = postBtn.cloneNode(true);
  postBtn.parentNode.replaceChild(newBtn, postBtn);

  newBtn.addEventListener('click', async () => {
    if (!currentUser) return showToast('Sign in to post');

    const content = document.getElementById('post-content').value.trim();
    if (!content) return showToast('Write something first!');

    // Check if image upload is still in progress
    const progressEl = document.getElementById('post-image-progress');
    if (progressEl && progressEl.innerHTML.includes('upload-progress-bar')) {
      return showToast('⏳ Image is still uploading, please wait...');
    }

    newBtn.disabled = true;
    newBtn.textContent = 'Posting...';

    try {
      // Pass image_url only if an image was uploaded
      const payload = { content };
      if (_pendingPostImageUrl) {
        payload.image_url = _pendingPostImageUrl;
      }

      await callEdge('create-post', payload);

      // Reset form
      document.getElementById('post-content').value = '';
      _pendingPostImageUrl = null;
      const imageInput = document.getElementById('post-image-input');
      const imagePreview = document.getElementById('post-image-preview');
      const removeBtn = document.getElementById('post-image-remove-btn');
      if (imageInput) imageInput.value = '';
      if (imagePreview) { imagePreview.innerHTML = ''; imagePreview.style.display = 'none'; }
      if (removeBtn) removeBtn.style.display = 'none';

      loadPosts();

    } catch (err) {
      showToast('❌ ' + err.message);
    } finally {
      newBtn.disabled = false;
      newBtn.textContent = 'Post';
    }
  });
});

// ============================================================
// PATCHED: renderPost — adds image display below post content
// Replace the renderPost function in community.js with this.
// ============================================================
function renderPost(post, score, myVote, previewComments, totalComments) {
  const profile = post.profiles || {};
  const avatarHtml = profile.avatar_url
    ? '<img src="' + escHtml(getOptimizedUrl(profile.avatar_url, 'w_80,h_80,c_fill,g_face')) + '" alt="' + escHtml(profile.name || 'User') + '">'
    : '<svg width="18" height="18" style="color:var(--text3)"><use href="#ic-user"/></svg>';

  const likeActive   = myVote === 1  ? 'emoji-vote-active' : '';
  const dislikeActive = myVote === -1 ? 'emoji-vote-active' : '';

  // ── Post image (Cloudinary) ───────────────────
  const postImageHtml = post.image_url
    ? '<div class="post-image-wrap"><img class="post-image" src="' +
      escHtml(post.image_url) +
      '" alt="Post image" loading="lazy" onclick="openImageLightbox(\'' +
      escHtml(post.image_url) +
      '\')" style="cursor:pointer"></div>'
    : '';

  let commentsPreviewHtml = '';
  if (previewComments.length > 0) {
    commentsPreviewHtml = '<div class="comments-preview">' +
      previewComments.map(c => {
        const cName = c.profiles ? c.profiles.name : 'Anonymous';
        const cAv = c.profiles && c.profiles.avatar_url
          ? '<img src="' + escHtml(c.profiles.avatar_url) + '" alt="' + escHtml(cName) + '">'
          : '<svg width="10" height="10" style="color:var(--text3)"><use href="#ic-user"/></svg>';
        return '<div class="comment-preview-item">' +
          '<div class="comment-preview-avatar">' + cAv + '</div>' +
          '<div class="comment-preview-text">' +
            '<span class="comment-preview-author">' + escHtml(cName) + roleBadge(c.profiles ? c.profiles.role : '') + '</span>' +
            '<span class="comment-preview-content">' + escHtml(c.content) + '</span>' +
          '</div></div>';
      }).join('') +
      (totalComments > 2 ? '<button class="view-more-comments-btn" onclick="openComments(\'' + post.id + '\', event)">View all ' + totalComments + ' comments →</button>' : '') +
    '</div>';
  }

  return '<div class="post-card" data-id="' + post.id + '">' +
    '<div class="post-body">' +
      '<div class="post-header">' +
        '<button class="post-avatar-btn" onclick="openProfileModal(\'' + post.user_id + '\')" title="View profile">' +
          '<div class="post-avatar">' + avatarHtml + '</div>' +
        '</button>' +
        '<div class="post-header-info">' +
          '<button class="post-author-link" onclick="openProfileModal(\'' + post.user_id + '\')">' +
            escHtml(profile.name || 'Anonymous') + roleBadge(profile.role) +
          '</button>' +
          '<div class="post-time">' + escHtml(profile.class || '') +
            (profile.class && profile.target_year ? ' · ' : '') +
            escHtml(profile.target_year ? 'Target ' + profile.target_year : '') +
            ' · ' + timeAgo(post.created_at) +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="post-content">' + escHtml(post.content) + '</div>' +
      postImageHtml +  // ← Image displayed here
      '<div class="post-actions-row">' +
        '<div class="emoji-vote-group">' +
          '<button class="emoji-vote-btn ' + likeActive + '" onclick="castVote(\'' + post.id + '\', 1)" title="Like">' +
            '👍 ' + (score > 0 ? '<span class="emoji-count score-pos">' + score + '</span>' : '') +
          '</button>' +
          '<button class="emoji-vote-btn ' + dislikeActive + '" onclick="castVote(\'' + post.id + '\', -1)" title="Dislike">' +
            '👎 ' + (score < 0 ? '<span class="emoji-count score-neg">' + Math.abs(score) + '</span>' : '') +
          '</button>' +
        '</div>' +
        '<button class="post-action-btn" onclick="openComments(\'' + post.id + '\', event)">' +
          '<svg width="13" height="13"><use href="#ic-chat"/></svg> ' +
          (totalComments > 0 ? totalComments + ' ' : '') + 'Comments' +
        '</button>' +
        '<button class="post-report-btn" onclick="openReportModal(\'post\', \'' + post.id + '\', null)">🚩 Report</button>' +
        (canModerate() ? '<button class="post-mod-btn" onclick="modDeletePost(\'' + post.id + '\')">🗑️ Delete</button>' : '') +
      '</div>' +
      commentsPreviewHtml +
    '</div>' +
  '</div>';
}

// ============================================================
// LIGHTBOX — click on post image to view full size
// ============================================================
function openImageLightbox(url) {
  let lb = document.getElementById('image-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'image-lightbox';
    lb.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;
      display:flex;align-items:center;justify-content:center;cursor:zoom-out;
    `;
    lb.innerHTML = `
      <img id="lightbox-img" style="max-width:92vw;max-height:92vh;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.6)">
      <button onclick="document.getElementById('image-lightbox').style.display='none'"
        style="position:fixed;top:1.2rem;right:1.5rem;background:rgba(255,255,255,.12);
               border:none;color:#fff;font-size:1.4rem;cursor:pointer;border-radius:50%;
               width:2.4rem;height:2.4rem;display:flex;align-items:center;justify-content:center;">✕</button>
    `;
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.style.display = 'none'; });
    document.body.appendChild(lb);
  }
  document.getElementById('lightbox-img').src = url;
  lb.style.display = 'flex';
}