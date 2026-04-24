// ============================================
// STUDY AURA — MY POSTS TAB (v1)
// Adds "All Posts / My Posts" tab switcher
// to the community page. Drop-in addition —
// does NOT modify community.js or kn.js.
// ============================================

// ── Active tab state ──────────────────────────
var _activeTab = 'all'; // 'all' | 'mine'

// ── Init tabs on DOM ready ────────────────────
document.addEventListener('DOMContentLoaded', function () {
  _initCommunityTabs();
});

function _initCommunityTabs() {
  var allBtn  = document.getElementById('tab-all-posts');
  var mineBtn = document.getElementById('tab-my-posts');
  if (!allBtn || !mineBtn) return;

  allBtn.addEventListener('click', function () {
    if (_activeTab === 'all') return;
    _activeTab = 'all';
    _setActiveTab('all');
    loadPosts();           // existing function — loads all posts
  });

  mineBtn.addEventListener('click', function () {
    if (_activeTab === 'mine') return;
    _activeTab = 'mine';
    _setActiveTab('mine');
    loadMyPosts();
  });
}

function _setActiveTab(tab) {
  var allBtn  = document.getElementById('tab-all-posts');
  var mineBtn = document.getElementById('tab-my-posts');
  var tabsWrap = document.querySelector('.community-tabs');

  if (!allBtn || !mineBtn) return;

  if (tab === 'all') {
    allBtn.classList.add('community-tab-active');
    mineBtn.classList.remove('community-tab-active');
    tabsWrap.classList.remove('mine-active');
  } else {
    mineBtn.classList.add('community-tab-active');
    allBtn.classList.remove('community-tab-active');
    tabsWrap.classList.add('mine-active');
  }
}

function renderPostSkeleton() {
  return `
    <div class="post-card skeleton-post">
      <div class="post-body">

        <div class="post-header">
          <div class="post-avatar skeleton"></div>

          <div style="flex:1">
            <div class="skeleton skeleton-line" style="width: 120px; height: 10px; margin-bottom:6px;"></div>
            <div class="skeleton skeleton-line" style="width: 80px; height: 8px;"></div>
          </div>
        </div>

        <div class="skeleton skeleton-line" style="width: 90%; height: 10px; margin:10px 0;"></div>
        <div class="skeleton skeleton-line" style="width: 75%; height: 10px; margin-bottom:10px;"></div>

        <div class="skeleton skeleton-line" style="width: 100%; height: 120px; border-radius: 10px; margin-bottom:10px;"></div>

        <div style="display:flex; gap:10px;">
          <div class="skeleton" style="width: 60px; height: 28px; border-radius: 20px;"></div>
          <div class="skeleton" style="width: 80px; height: 28px; border-radius: 20px;"></div>
        </div>

      </div>
    </div>
  `;
}

// ============================================================
// loadMyPosts — same logic as loadPosts() but filtered
// to only the current user's posts.
// ============================================================
async function loadMyPosts() {
  if (!currentUser) {
    var list = document.getElementById('posts-list');
    if (list) list.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div>Sign in to see your posts</div>';
    return;
  }

  var list = document.getElementById('posts-list');
  list.innerHTML = new Array(4).fill(0).map(renderPostSkeleton).join('');

  // ── Fetch only this user's posts ──────────────
  var result = await db.from('posts')
    .select('*, profiles(id, name, avatar_url, class, target_year, bio, role)')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(50);

  var posts = result.data;
  var error = result.error;

  if (error || !posts) {
    list.innerHTML = '<div class="empty-state">Failed to load your posts</div>';
    return;
  }

  if (posts.length === 0) {
    list.innerHTML =
      '<div class="empty-state">' +
        '<div class="my-posts-empty-icon">✍️</div>' +
        '<div class="my-posts-empty-title">No posts yet</div>' +
        '<div class="my-posts-empty-sub">Share something with the community!</div>' +
      '</div>';
    return;
  }

  var postIds = posts.map(function (p) { return p.id; });

  // ── Fetch votes + comments in parallel ────────
  var fetchResults = await Promise.all([
    db.from('votes').select('post_id, value').in('post_id', postIds),
    db.from('votes').select('post_id, value').eq('user_id', currentUser.id).in('post_id', postIds),
    db.from('comments')
      .select('*, profiles(name, avatar_url, role)')
      .in('post_id', postIds)
      .order('created_at', { ascending: true })
  ]);

  var voteCounts  = fetchResults[0].data || [];
  var myVotes     = fetchResults[1].data || [];
  var allComments = fetchResults[2].data || [];

  var scoreMap = {};
  voteCounts.forEach(function (v) {
    scoreMap[v.post_id] = (scoreMap[v.post_id] || 0) + v.value;
  });

  var myVoteMap = {};
  myVotes.forEach(function (v) { myVoteMap[v.post_id] = v.value; });

  var commentMap      = {};
  var commentCountMap = {};
  allComments.forEach(function (c) {
    if (!commentMap[c.post_id]) commentMap[c.post_id] = [];
    commentMap[c.post_id].push(c);
    commentCountMap[c.post_id] = (commentCountMap[c.post_id] || 0) + 1;
  });

  // ── Render with "My Post" badge on each card ──
  list.innerHTML = posts.map(function (post) {
    var previewComments = (commentMap[post.id] || []).slice(-2);
    var totalComments   = commentCountMap[post.id] || 0;
    return renderMyPost(post, scoreMap[post.id] || 0, myVoteMap[post.id] || 0, previewComments, totalComments);
  }).join('');
  
}

// ── renderMyPost — same as renderPost but adds a
//    delete button always visible (it's your own post)
//    and a subtle "My Post" indicator.
function renderMyPost(post, score, myVote, previewComments, totalComments) {
  var profile = post.profiles || {};

  var avatarSrc = profile.avatar_url
    ? getOptimizedUrl(profile.avatar_url, 'w_80,h_80,c_fill,g_face')
    : '';
  var avatarHtml = avatarSrc
    ? '<img src="' + escHtml(avatarSrc) + '" alt="' + escHtml(profile.name || 'User') + '">'
    : '<svg width="18" height="18" style="color:var(--text3)"><use href="#ic-user"/></svg>';

  var likeActive    = myVote ===  1 ? 'emoji-vote-active' : '';
  var dislikeActive = myVote === -1 ? 'emoji-vote-active' : '';

  // Title
  var titleHtml = post.title
    ? '<div class="post-title">' + escHtml(post.title) + '</div>'
    : '';

  // Images
  var images = [];
  if (Array.isArray(post.image_urls) && post.image_urls.length) {
    images = post.image_urls;
  } else if (typeof post.image_urls === 'string' && post.image_urls.length > 2) {
    try { images = JSON.parse(post.image_urls); } catch (e) { images = []; }
  } else if (post.image_url) {
    images = [post.image_url];
  }
  var imagesHtml = images.length ? _buildImageGrid(images) : '';

  // Comment previews
  var commentsPreviewHtml = '';
  if (previewComments.length > 0) {
    var items = previewComments.map(function (c) {
      var cName = c.profiles ? c.profiles.name : 'Anonymous';
      var cAv   = c.profiles && c.profiles.avatar_url
        ? '<img src="' + escHtml(c.profiles.avatar_url) + '" alt="' + escHtml(cName) + '">'
        : '<svg width="10" height="10" style="color:var(--text3)"><use href="#ic-user"/></svg>';
      return '<div class="comment-preview-item">' +
        '<div class="comment-preview-avatar">' + cAv + '</div>' +
        '<div class="comment-preview-text">' +
          '<span class="comment-preview-author">' + escHtml(cName) + roleBadge(c.profiles ? c.profiles.role : '') + '</span>' +
          '<span class="comment-preview-content">' + escHtml(c.content) + '</span>' +
        '</div></div>';
    }).join('');

    var viewMore = totalComments > 2
      ? '<button class="view-more-comments-btn" onclick="openComments(\'' + post.id + '\', event)">View all ' + totalComments + ' comments</button>'
      : '';
    commentsPreviewHtml = '<div class="comments-preview">' + items + viewMore + '</div>';
  }

  // Meta string
  var metaParts = [];
  if (profile.class) metaParts.push(escHtml(profile.class));
  if (profile.target_year) metaParts.push('Target ' + escHtml(profile.target_year));
  metaParts.push(timeAgo(post.created_at));
  var metaStr = metaParts.join(' · ');

  var likeCount    = score > 0 ? '<span class="emoji-count score-pos">' + score + '</span>' : '';
  var dislikeCount = score < 0 ? '<span class="emoji-count score-neg">' + Math.abs(score) + '</span>' : '';

  // Stats row under card
  var statsHtml =
    '<div class="my-post-stats">' +
      '<span class="my-post-stat">' +
        (score > 0 ? '+' : '') + score + ' votes' +
      '</span>' +
      '<span class="my-post-stat">' + totalComments + ' comment' + (totalComments !== 1 ? 's' : '') + '</span>' +
      '<span class="my-post-stat">' + timeAgo(post.created_at) + '</span>' +
    '</div>';

  return '<div class="post-card my-post-card" data-id="' + post.id + '">' +
    '<div class="my-post-badge">My Post</div>' +
    '<div class="post-body">' +
      '<div class="post-header">' +
        '<div class="post-avatar">' + avatarHtml + '</div>' +
        '<div class="post-header-info">' +
          '<span class="post-author-link">' + escHtml(profile.name || 'You') + roleBadge(profile.role) + '</span>' +
          '<div class="post-time">' + metaStr + '</div>' +
        '</div>' +
      '</div>' +
      titleHtml +
      '<div class="post-content">' + escHtml(post.content) + '</div>' +
      imagesHtml +
      '<div class="post-actions-row">' +
        '<div class="emoji-vote-group">' +
          '<button class="emoji-vote-btn ' + likeActive + '" onclick="castVote(\'' + post.id + '\', 1)" title="Like">' +
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-8 8h6v8h4v-8h6z"/></svg>' + likeCount +
'</button>' +
          '<button class="emoji-vote-btn ' + dislikeActive + '" onclick="castVote(\'' + post.id + '\', -1)" title="Dislike">' +
  ' <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20l8-8h-6V4h-4v8H4z"/></svg>' + dislikeCount +
'</button>' +
        '</div>' +
        '<button class="post-action-btn" onclick="openComments(\'' + post.id + '\', event)">' +
          '<svg width="13" height="13"><use href="#ic-chat"/></svg> ' +
          (totalComments > 0 ? totalComments + ' ' : '') + 'Comments' +
        '</button>' +
        '<button class="my-post-delete-btn" onclick="_deleteMyPost(\'' + post.id + '\')">🗑️ Delete</button>' +
      '</div>' +
      commentsPreviewHtml +
    '</div>' +
  '</div>';
}

// ── Delete own post ───────────────────────────
function _deleteMyPost(postId) {
  showConfirm(
    'Delete Post',
    'Delete this post and all its comments? This cannot be undone.',
    async function () {
      var result = await db.from('posts').delete().eq('id', postId).eq('user_id', currentUser.id);
      if (result.error) return showToast('Error: ' + result.error.message);
      showToast('Post deleted');
      loadMyPosts();  // stay on My Posts tab, refresh
    }
  );
}

// ── When community page opens, respect active tab ─
// Patch goToPage so switching back to community keeps the right tab
var _origGoToPage = window.goToPage;
var _popularPostsLastFetch = 0;
var POPULAR_POSTS_TTL_MS = 2 * 60 * 1000; // 2 minutes

if (typeof _origGoToPage === 'function') {
  window.goToPage = function (pageId) {
    _origGoToPage(pageId);
    if (pageId === 'community') {
      // Re-apply correct tab state after page switch
      _setActiveTab(_activeTab);
      if (_activeTab === 'mine') loadMyPosts();
      if (_activeTab === 'all') {
        // Only re-fetch popular posts if cache is stale
        if (Date.now() - _popularPostsLastFetch > POPULAR_POSTS_TTL_MS) {
          _popularPostsLastFetch = Date.now();
          loadPopularPosts();
        }
      }
    }
  };
}