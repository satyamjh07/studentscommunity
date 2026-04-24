// ============================================
// STUDY AURA — CLOUDINARY COMMUNITY (v4 — fixed)
// Fixes:
//   - No unicode escape sequences (caused SyntaxError)
//   - File input trigger works with existing HTML structure
//   - Multi-image upload (up to 5)
//   - Post title support
//   - Proportional image grid in feed
//   - Full-screen lightbox with prev/next
// ============================================

// ── Upload state ──────────────────────────────
var _pendingImageFiles = []; // File objects
var _pendingImageUrls = []; // Cloudinary URLs (null = still uploading)
var _uploadingCount = 0; // In-flight uploads
var MAX_IMAGES = 5;

// ── Init on DOM ready ─────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  _initComposerImagePicker();
  _patchPostSubmit();
  _buildImageLightbox();
});

// ============================================================
// COMPOSER — multi-image picker
// Works with the existing HTML that already has:
//   #post-image-add-btn, #post-image-input, #post-image-thumbs
// ============================================================
function _initComposerImagePicker() {
  var input = document.getElementById("post-image-input");
  var addBtn = document.getElementById("post-image-add-btn");
  var thumbsWrap = document.getElementById("post-image-thumbs");
  var countEl = document.getElementById("post-image-count");

  if (!input) return;

  // Hide the native file input — we trigger it from the button
  input.style.display = "none";

  // Button click opens file picker
  if (addBtn) {
    // Clone to remove any previous listeners (e.g. from old cloudinary-community.js)
    var newBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newBtn, addBtn);
    newBtn.addEventListener("click", function () {
      var currentCount = _pendingImageFiles.filter(Boolean).length;
      if (currentCount >= MAX_IMAGES) {
        showToast("Max " + MAX_IMAGES + " images per post");
        return;
      }
      input.click();
    });
  }

  // File selected
  input.addEventListener("change", function () {
    var files = Array.from(this.files);
    this.value = ""; // reset so same file can be re-picked after remove

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var currentCount = _pendingImageFiles.filter(Boolean).length;

      if (currentCount >= MAX_IMAGES) {
        showToast("Max " + MAX_IMAGES + " images reached");
        break;
      }
      if (!file.type.startsWith("image/")) {
        showToast('"' + file.name + '" is not an image');
        continue;
      }
      if (file.size > 1 * 1024 * 1024) {
        showToast('"' + file.name + '" exceeds 1 MB');
        continue;
      }

      var idx = _pendingImageFiles.length;
      _pendingImageFiles.push(file);
      _pendingImageUrls.push(null); // will be filled after upload

      _addThumb(
        file,
        idx,
        thumbsWrap || document.getElementById("post-image-thumbs"),
      );
      _updateImageCount(countEl || document.getElementById("post-image-count"));
      _uploadOne(file, idx);
    }
  });
}

// Adds a thumbnail preview card to the composer strip
function _addThumb(file, idx, container) {
  if (!container) return;

  var card = document.createElement("div");
  card.className = "composer-thumb";
  card.id = "composer-thumb-" + idx;

  var img = document.createElement("img");
  img.alt = "preview";
  var reader = new FileReader();
  reader.onload = function (e) {
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);

  var spinner = document.createElement("div");
  spinner.className = "thumb-spinner";
  spinner.id = "thumb-spinner-" + idx;
  spinner.innerHTML = '<div class="spin-ring"></div>';

  var rmBtn = document.createElement("button");
  rmBtn.className = "thumb-remove-btn";
  rmBtn.type = "button";
  rmBtn.title = "Remove";
  rmBtn.textContent = "x";
  rmBtn.setAttribute("data-idx", idx);
  rmBtn.addEventListener("click", function () {
    _removeThumb(parseInt(this.getAttribute("data-idx")));
  });

  card.appendChild(img);
  card.appendChild(spinner);
  card.appendChild(rmBtn);
  container.appendChild(card);
}

// Upload a single file to Cloudinary
function _uploadOne(file, idx) {
  _uploadingCount++;
  var spinner = document.getElementById("thumb-spinner-" + idx);
  if (spinner) spinner.style.display = "flex";

  uploadImageToCloudinary(file, { maxSizeMB: 1, folder: "study_aura/posts" })
    .then(function (url) {
      _pendingImageUrls[idx] = getOptimizedUrl(url, "w_1200,q_auto,f_auto");
      var sp = document.getElementById("thumb-spinner-" + idx);
      if (sp) sp.style.display = "none";
      var card = document.getElementById("composer-thumb-" + idx);
      if (card) card.classList.add("thumb-ready");
    })
    .catch(function (err) {
      showToast("Upload failed: " + err.message);
      _removeThumb(idx);
    })
    .finally(function () {
      _uploadingCount--;
      _updateImageCount(document.getElementById("post-image-count"));
    });
}

// Remove a thumb from the strip and the pending arrays
function _removeThumb(idx) {
  var card = document.getElementById("composer-thumb-" + idx);
  if (card) card.remove();

  _pendingImageFiles[idx] = null;
  _pendingImageUrls[idx] = null;

  // Compact both arrays (remove null holes)
  var newFiles = [];
  var newUrls = [];
  for (var i = 0; i < _pendingImageFiles.length; i++) {
    if (_pendingImageFiles[i] !== null) {
      newFiles.push(_pendingImageFiles[i]);
      newUrls.push(_pendingImageUrls[i]);
    }
  }
  _pendingImageFiles = newFiles;
  _pendingImageUrls = newUrls;

  // Re-index remaining thumb cards
  var container = document.getElementById("post-image-thumbs");
  if (container) {
    var cards = container.querySelectorAll(".composer-thumb");
    cards.forEach(function (el, i) {
      el.id = "composer-thumb-" + i;
      var sp = el.querySelector(".thumb-spinner");
      var rm = el.querySelector(".thumb-remove-btn");
      if (sp) sp.id = "thumb-spinner-" + i;
      if (rm) rm.setAttribute("data-idx", i);
    });
  }

  _updateImageCount(document.getElementById("post-image-count"));
}

// Update the "N/5 images" counter label
function _updateImageCount(el) {
  if (!el) return;
  var n = _pendingImageFiles.filter(Boolean).length + _uploadingCount;
  if (n > 0) {
    el.textContent = n + "/" + MAX_IMAGES + " image" + (n !== 1 ? "s" : "");
  } else {
    el.textContent = "";
  }
}

// ============================================================
// PATCHED POST SUBMIT
// ============================================================
function _patchPostSubmit() {
  var oldBtn = document.getElementById("post-btn");
  if (!oldBtn) return;

  // Clone to strip old listeners from community.js
  var btn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(btn, oldBtn);

  btn.addEventListener("click", function () {
    if (!currentUser) return showToast("Sign in to post");

    var contentEl = document.getElementById("post-content");
    var titleEl = document.getElementById("post-title");
    var content = contentEl ? contentEl.value.trim() : "";
    var title = titleEl ? titleEl.value.trim() : "";

    if (!content && !title) return showToast("Write something first!");
    if (_uploadingCount > 0)
      return showToast("Images still uploading, please wait...");

    var imageUrls = _pendingImageUrls.filter(Boolean);

    btn.disabled = true;
    btn.textContent = "Posting...";

    var payload = { content: content || " " };
    if (title) payload.title = title;
    if (imageUrls.length) payload.image_urls = imageUrls;

    callEdge("create-post", payload)
      .then(function () {
        // Reset composer
        if (contentEl) contentEl.value = "";
        if (titleEl) titleEl.value = "";
        _pendingImageFiles = [];
        _pendingImageUrls = [];
        var thumbs = document.getElementById("post-image-thumbs");
        if (thumbs) thumbs.innerHTML = "";
        _updateImageCount(document.getElementById("post-image-count"));
        loadPosts();
      })
      .catch(function (err) {
        showToast(err.message);
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = "Post";
      });
  });
}

// ============================================================
// renderPost — overrides the version in community.js / kn.js
// This file loads AFTER them so this definition wins.
// ============================================================
function renderPost(post, score, myVote, previewComments, totalComments) {
  var profile = post.profiles || {};

  var avatarSrc = profile.avatar_url
    ? getOptimizedUrl(profile.avatar_url, "w_80,h_80,c_fill,g_face")
    : "";
  var avatarHtml = avatarSrc
    ? '<img src="' +
      escHtml(avatarSrc) +
      '" alt="' +
      escHtml(profile.name || "User") +
      '">'
    : '<svg width="18" height="18" style="color:var(--text3)"><use href="#ic-user"/></svg>';

  var likeActive = myVote === 1 ? "emoji-vote-active" : "";
  var dislikeActive = myVote === -1 ? "emoji-vote-active" : "";

  // ── Title ─────────────────────────────────────
  var titleHtml = post.title
    ? '<div class="post-title">' + escHtml(post.title) + "</div>"
    : "";

  // ── Images — handle array, JSON string, or legacy single URL ──
  var images = [];
  if (Array.isArray(post.image_urls) && post.image_urls.length) {
    images = post.image_urls;
  } else if (
    typeof post.image_urls === "string" &&
    post.image_urls.length > 2
  ) {
    try {
      images = JSON.parse(post.image_urls);
    } catch (e) {
      images = [];
    }
  } else if (post.image_url) {
    images = [post.image_url]; // legacy single-image
  }
  var imagesHtml = images.length ? _buildImageGrid(images) : "";

  // ── Comment preview strip ──────────────────────
  var commentsPreviewHtml = "";
  if (previewComments.length > 0) {
    var commentItems = previewComments
      .map(function (c) {
        var cName = c.profiles ? c.profiles.name : "Anonymous";
        var cAv =
          c.profiles && c.profiles.avatar_url
            ? '<img src="' +
              escHtml(c.profiles.avatar_url) +
              '" alt="' +
              escHtml(cName) +
              '">'
            : '<svg width="10" height="10" style="color:var(--text3)"><use href="#ic-user"/></svg>';
        return (
          '<div class="comment-preview-item">' +
          '<div class="comment-preview-avatar">' +
          cAv +
          "</div>" +
          '<div class="comment-preview-text">' +
          '<span class="comment-preview-author">' +
          escHtml(cName) +
          roleBadge(c.profiles ? c.profiles.role : "") +
          "</span>" +
          '<span class="comment-preview-content">' +
          escHtml(c.content) +
          "</span>" +
          "</div></div>"
        );
      })
      .join("");

    var viewMoreBtn =
      totalComments > 2
        ? '<button class="view-more-comments-btn" onclick="openComments(\'' +
          post.id +
          "', event)\">View all " +
          totalComments +
          " comments</button>"
        : "";

    commentsPreviewHtml =
      '<div class="comments-preview">' + commentItems + viewMoreBtn + "</div>";
  }

  // ── Class + year meta ──────────────────────────
  var metaParts = [];
  if (profile.class) metaParts.push(escHtml(profile.class));
  if (profile.target_year)
    metaParts.push("Target " + escHtml(profile.target_year));
  metaParts.push(timeAgo(post.created_at));
  var metaStr = metaParts.join(" · ");

  // ── Score display ──────────────────────────────
  var likeCount =
    score > 0 ? '<span class="emoji-count score-pos">' + score + "</span>" : "";
  var dislikeCount =
    score < 0
      ? '<span class="emoji-count score-neg">' + Math.abs(score) + "</span>"
      : "";

  // ── Delete button for mods ─────────────────────
  var modDeleteBtn = canModerate()
    ? '<button class="post-mod-btn" onclick="modDeletePost(\'' +
      post.id +
      "')\">Delete</button>"
    : "";

  return (
    '<div class="post-card" data-id="' +
    post.id +
    '">' +
    '<div class="post-body">' +
    '<div class="post-header">' +
    '<button class="post-avatar-btn" onclick="openProfileModal(\'' +
    post.user_id +
    '\')" title="View profile">' +
    '<div class="post-avatar">' +
    avatarHtml +
    "</div>" +
    "</button>" +
    '<div class="post-header-info">' +
    '<button class="post-author-link" onclick="openProfileModal(\'' +
    post.user_id +
    "')\">" +
    escHtml(profile.name || "Anonymous") +
    roleBadge(profile.role) +
    "</button>" +
    '<div class="post-time">' +
    metaStr +
    "</div>" +
    "</div>" +
    "</div>" +
    titleHtml +
    '<div class="post-content">' +
    escHtml(post.content) +
    "</div>" +
    imagesHtml +
    '<div class="post-actions-row">' +
    '<div class="emoji-vote-group">' +
    '<button class="emoji-vote-btn ' +
    likeActive +
    '" onclick="castVote(\'' +
    post.id +
    '\', 1)" title="Like">' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-8 8h6v8h4v-8h6z"/> </svg>' +
    likeCount +
    "</button>" +
    '<button class="emoji-vote-btn ' +
    dislikeActive +
    '" onclick="castVote(\'' +
    post.id +
    '\', -1)" title="Dislike">' +
    ' <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"> <path d="M12 20l8-8h-6V4h-4v8H4z"/> </svg>' +
    dislikeCount +
    "</button>" +
    "</div>" +
    '<button class="post-action-btn" onclick="openComments(\'' +
    post.id +
    "', event)\">" +
    '<svg width="13" height="13"><use href="#ic-chat"/></svg> ' +
    (totalComments > 0 ? totalComments + " " : "") +
    "Comments" +
    "</button>" +
    "<button class=\"post-report-btn\" onclick=\"openReportModal('post', '" +
    post.id +
    "', null)\">Report</button>" +
    modDeleteBtn +
    "</div>" +
    commentsPreviewHtml +
    "</div>" +
    "</div>"
  );
}

// ── Build proportional image grid ─────────────
function _buildImageGrid(images) {
  var total = images.length;
  var show = Math.min(total, 5);
  var extra = total > 5 ? total - 4 : 0;

  var cells = "";
  for (var i = 0; i < show; i++) {
    var url = images[i];
    var thumb = getOptimizedUrl(url, "w_800,q_auto,f_auto");
    var isLast = show === 5 && i === 4 && extra > 0;

    // Build onclick — pass the full array as a JSON string via a data attribute
    // to avoid any quoting issues inside the attribute
    var cellId = "img-cell-" + Math.random().toString(36).slice(2, 7);

    cells +=
      '<div class="img-cell' +
      (isLast ? " img-cell-more" : "") +
      '" ' +
      'id="' +
      cellId +
      '" ' +
      "data-images='" +
      _safeJsonAttr(images) +
      "' " +
      'data-index="' +
      i +
      '" ' +
      'onclick="_handleImageCellClick(this)">' +
      '<img src="' +
      escHtml(thumb) +
      '" alt="Post image ' +
      (i + 1) +
      '" loading="lazy">' +
      (isLast ? '<div class="img-more-label">+' + extra + "</div>" : "") +
      "</div>";
  }

  return '<div class="img-grid img-grid-' + show + '">' + cells + "</div>";
}

// Safe JSON for an HTML attribute value (uses single-quote wrapper so we escape single quotes)
function _safeJsonAttr(arr) {
  return JSON.stringify(arr).replace(/'/g, "&#39;");
}

// Called by img-cell onclick — reads data attrs to avoid inline JSON quoting issues
function _handleImageCellClick(el) {
  try {
    var images = JSON.parse(
      el.getAttribute("data-images").replace(/&#39;/g, "'"),
    );
    var idx = parseInt(el.getAttribute("data-index")) || 0;
    openPostLightbox(images, idx);
  } catch (e) {
    console.warn("Image lightbox error:", e);
  }
}

// ============================================================
// LIGHTBOX
// ============================================================
var _lbImages = [];
var _lbCurrent = 0;

function _buildImageLightbox() {
  if (document.getElementById("post-lightbox")) return;

  var lb = document.createElement("div");
  lb.id = "post-lightbox";

  lb.innerHTML = [
    '<div class="lb-backdrop" onclick="closeLightbox()"></div>',
    '<div class="lb-shell">',
    '<button type="button" class="lb-close" onclick="closeLightbox()" title="Close">&#x00D7;</button>',
    '<button type="button" class="lb-arrow lb-prev" onclick="lbNavigate(-1)" title="Previous">&#x2039;</button>',
    '<div class="lb-img-wrap">',
    '<img id="lb-main-img" src="" alt="Full size image">',
    '<div class="lb-spinner" id="lb-spinner"><div class="spin-ring"></div></div>',
    "</div>",
    '<button type="button" class="lb-arrow lb-next" onclick="lbNavigate(1)" title="Next">&#x203A;</button>',
    '<div class="lb-counter" id="lb-counter"></div>',
    "</div>",
  ].join("");

  document.body.appendChild(lb);

  // Keyboard navigation
  document.addEventListener("keydown", function (e) {
    if (!document.getElementById("post-lightbox").classList.contains("lb-open"))
      return;
    if (e.key === "ArrowRight") lbNavigate(1);
    if (e.key === "ArrowLeft") lbNavigate(-1);
    if (e.key === "Escape") closeLightbox();
  });
}

function openPostLightbox(images, startIdx) {
  if (!Array.isArray(images) || !images.length) return;
  _lbImages = images;
  _lbCurrent = startIdx || 0;

  var lb = document.getElementById("post-lightbox");
  if (!lb) {
    _buildImageLightbox();
    lb = document.getElementById("post-lightbox");
  }

  lb.classList.add("lb-open");
  document.body.style.overflow = "hidden";
  _lbShow(_lbCurrent);
}

function closeLightbox() {
  var lb = document.getElementById("post-lightbox");
  if (lb) lb.classList.remove("lb-open");
  document.body.style.overflow = "";
}

function lbNavigate(dir) {
  _lbCurrent = (_lbCurrent + dir + _lbImages.length) % _lbImages.length;
  _lbShow(_lbCurrent);
}

function _lbShow(idx) {
  var img = document.getElementById("lb-main-img");
  var spinner = document.getElementById("lb-spinner");
  var counter = document.getElementById("lb-counter");
  var prevBtn = document.querySelector(".lb-prev");
  var nextBtn = document.querySelector(".lb-next");
  if (!img) return;

  var url = getOptimizedUrl(_lbImages[idx], "w_1800,q_auto,f_auto");

  img.style.opacity = "0";
  if (spinner) spinner.style.display = "flex";

  img.onload = function () {
    if (spinner) spinner.style.display = "none";
    img.style.opacity = "1";
  };
  img.onerror = function () {
    if (spinner) spinner.style.display = "none";
    img.style.opacity = "0.5";
  };
  img.src = url;

  if (counter) counter.textContent = idx + 1 + " / " + _lbImages.length;

  var multi = _lbImages.length > 1;
  if (prevBtn) prevBtn.style.display = multi ? "flex" : "none";
  if (nextBtn) nextBtn.style.display = multi ? "flex" : "none";
}
