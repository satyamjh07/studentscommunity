// ============================================
// STUDY AURA — COMMUNITY (v4 — Secure)
// Posts & comments go through Edge Functions.
// ============================================

let activePostId = null;
let activePostData = null;

// ── Role badge helper ────────────────────────
function roleBadge(role) {
  if (!role || role === 'member') return '';
  if (role === 'admin') return '<span class="role-badge badge-admin">ADMIN</span>';
  if (role === 'mod') return '<span class="role-badge badge-mod">MOD</span>';
  return '';
}

// ── Live mute check ──────────────────────────
async function isUserMuted() {
  if (!currentUser) return false;
  const { data } = await db.from('profiles')
    .select('muted_until')
    .eq('id', currentUser.id)
    .single();
  if (!data || !data.muted_until) return false;
  return new Date(data.muted_until) > new Date();
}

async function getMuteEndTime() {
  if (!currentUser) return null;
  const { data } = await db.from('profiles')
    .select('muted_until')
    .eq('id', currentUser.id)
    .single();
  if (!data || !data.muted_until) return null;
  const d = new Date(data.muted_until);
  return d > new Date() ? d : null;
}

// ── Edge Function helper ─────────────────────
async function callEdge(fnName, body) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const EDGE_BASE = window.SUPABASE_URL || 'https://biqdrsqirzxnznyucwtz.supabase.co';
  const res = await fetch(`${EDGE_BASE}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + session.access_token,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Error from ${fnName}`);
  return json;
}

// ── Render posts ─────────────────────────────
async function loadPosts() {
  const list = document.getElementById('posts-list');
 list.innerHTML = new Array(4).fill(0).map(renderPostSkeleton).join('');

  const { data: posts, error } = await db.from('posts')
    .select('*, profiles(id, name, avatar_url, class, target_year, bio, role)')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error || !posts) {
    list.innerHTML = '<div class="empty-state">Failed to load posts</div>';
    return;
  }

  if (posts.length === 0) {
    list.innerHTML = '<div class="empty-state"><svg width="40" height="40" style="color:var(--text3);margin-bottom:.5rem"><use href="#ic-users"/></svg><div>No posts yet. Be the first!</div></div>';
    return;
  }

  const postIds = posts.map(p => p.id);
  const [{ data: voteCounts }, { data: myVotes }, { data: allComments }] = await Promise.all([
    db.from('votes').select('post_id, value').in('post_id', postIds),
    currentUser
      ? db.from('votes').select('post_id, value').eq('user_id', currentUser.id).in('post_id', postIds)
      : { data: [] },
    db.from('comments')
      .select('*, profiles(name, avatar_url, role)')
      .in('post_id', postIds)
      .order('created_at', { ascending: true })
  ]);

  const scoreMap = {};
  (voteCounts || []).forEach(v => { scoreMap[v.post_id] = (scoreMap[v.post_id] || 0) + v.value; });
  const myVoteMap = {};
  (myVotes || []).forEach(v => { myVoteMap[v.post_id] = v.value; });

  const commentMap = {};
  const commentCountMap = {};
  (allComments || []).forEach(c => {
    if (!commentMap[c.post_id]) commentMap[c.post_id] = [];
    commentMap[c.post_id].push(c);
    commentCountMap[c.post_id] = (commentCountMap[c.post_id] || 0) + 1;
  });

  list.innerHTML = posts.map(post => {
    const previewComments = (commentMap[post.id] || []).slice(-2);
    const totalComments = commentCountMap[post.id] || 0;
    return renderPost(post, scoreMap[post.id] || 0, myVoteMap[post.id] || 0, previewComments, totalComments);
  }).join('');
}

function renderPost(post, score, myVote, previewComments, totalComments) {
  const profile = post.profiles || {};
  const avatarHtml = profile.avatar_url
    ? '<img src="' + escHtml(profile.avatar_url) + '" alt="' + escHtml(profile.name || 'User') + '">'
    : '<svg width="18" height="18" style="color:var(--text3)"><use href="#ic-user"/></svg>';

  const likeActive   = myVote === 1  ? 'emoji-vote-active' : '';
  const dislikeActive = myVote === -1 ? 'emoji-vote-active' : '';
  const likeCount    = score > 0 ? '<span class="emoji-count score-pos">' + score + '</span>' : '';
  const dislikeCount = score < 0 ? '<span class="emoji-count score-neg">' + Math.abs(score) + '</span>' : '';

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
        '<button class="post-report-btn" onclick="openReportModal(\'post\', \'' + post.id + '\', null)">🚩 Report</button>' +
        (canModerate() ? '<button class="post-mod-btn" onclick="modDeletePost(\'' + post.id + '\')">🗑️ Delete</button>' : '') +
      '</div>' +
      commentsPreviewHtml +
    '</div>' +
  '</div>';
}

// ── Voting (unchanged — reads are fine direct) ───
async function castVote(postId, value) {
  if (!currentUser) return showToast('Sign in to vote');
  const { data: existing } = await db.from('votes')
    .select('id, value').eq('post_id', postId).eq('user_id', currentUser.id).maybeSingle();
  if (existing) {
    if (existing.value === value) await db.from('votes').delete().eq('id', existing.id);
    else await db.from('votes').update({ value }).eq('id', existing.id);
  } else {
    await db.from('votes').insert({ post_id: postId, user_id: currentUser.id, value });
  }
  loadPosts();
}

// ── Post submit — via Edge Function ─────────────
document.getElementById('post-btn').addEventListener('click', async () => {
  if (!currentUser) return showToast('Sign in to post');
  const content = document.getElementById('post-content').value.trim();
  if (!content) return showToast('Write something first!');

  const btn = document.getElementById('post-btn');
  btn.disabled = true;
  btn.textContent = 'Posting...';

  try {
    await callEdge('create-post', { content });
    document.getElementById('post-content').value = '';
    loadPosts();
  } catch (err) {
    showToast('❌ ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Post';
  }
});

// ── Comment submit — via Edge Function ─────────
async function submitComment(postId) {
  if (!currentUser) return showToast('Sign in to comment');
  const input = document.getElementById('comment-input');
  const content = (input ? input.value : '').trim();
  const pendingUrl = window._commentImageUrl || null;

  if (!content && !pendingUrl) return showToast('Write a comment or add an image first!');
  if (window._commentImageUploading) return showToast('Image still uploading, please wait...');

  const btn = document.getElementById('comment-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Posting...'; }

  try {
    const payload = { post_id: postId, content: content || ' ' };
    if (pendingUrl) payload.image_url = pendingUrl;
    await callEdge('add-comment', payload);
    if (input) input.value = '';
    _clearCommentImage();
    // Refresh comments in modal
    if (activePostId) {
      const { data: comments } = await db.from('comments')
        .select('*, profiles(id, name, avatar_url, role)')
        .eq('post_id', activePostId).order('created_at', { ascending: true });
      renderCommentsInModal(comments || [], await _fetchCommentVoteMap(comments || []));
    }
    loadPosts();
  } catch (err) {
    showToast('❌ ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Comment'; }
  }
}

// ── Moderation (unchanged — mods/admins use service role via RLS) ────
function canModerate() {
  return currentProfile && (currentProfile.role === 'mod' || currentProfile.role === 'admin');
}

function modDeletePost(postId) {
  showConfirm('Delete Post', 'Delete this post and all its comments? This cannot be undone.', async () => {
    const { error } = await db.from('posts').delete().eq('id', postId);
    if (error) return showToast('Error: ' + error.message);
    showToast('✅ Post deleted');
    if (activePostId === postId) closeCommentModal();
    loadPosts();
  });
}

function modDeleteComment(commentId) {
  showConfirm('Delete Comment', 'Delete this comment? This cannot be undone.', async () => {
    const { error } = await db.from('comments').delete().eq('id', commentId);
    if (error) return showToast('Error: ' + error.message);
    showToast('✅ Comment deleted');
    if (activePostId) {
      const { data: comments } = await db.from('comments')
        .select('*, profiles(id, name, avatar_url, role)')
        .eq('post_id', activePostId).order('created_at', { ascending: true });
      renderCommentsInModal(comments || []);
    }
    loadPosts();
  });
}

// ── Mute modal (unchanged) ───────────────────
let muteTargetUserId = null;
let muteTargetUserName = null;

function openMuteModal(userId, userName) {
  if (!canModerate()) return;
  muteTargetUserId = userId;
  muteTargetUserName = userName;
  document.getElementById('mute-user-name').textContent = userName;
  document.getElementById('mute-modal').style.display = 'flex';
}

function closeMuteModal() {
  document.getElementById('mute-modal').style.display = 'none';
  muteTargetUserId = null;
  muteTargetUserName = null;
}

async function applyMute(minutes) {
  if (!muteTargetUserId || !canModerate()) return;
  const muteUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const label = minutes < 60 ? minutes + ' minutes' : (minutes / 60) + ' hour(s)';
  const targetId = muteTargetUserId;
  const targetName = muteTargetUserName;

  const { error } = await db.from('profiles')
    .update({ muted_until: muteUntil })
    .eq('id', targetId);

  if (error) { showToast('Error applying mute: ' + error.message); return; }

  const { data: verify } = await db.from('profiles')
    .select('muted_until').eq('id', targetId).single();

  if (!verify || !verify.muted_until || new Date(verify.muted_until) <= new Date()) {
    showToast('❌ Mute failed — check RLS policies.');
    return;
  }

  const muteEndFormatted = new Date(muteUntil).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  await db.from('notifications').insert({
    title: '🔇 You have been muted',
    message: 'You have been muted for ' + label + ' by a moderator. You will be able to post again after ' + muteEndFormatted + '.',
    user_id: targetId
  });

  closeMuteModal();
  showToast('🔇 ' + targetName + ' muted for ' + label);
}

// ── Profile modal (unchanged) ─────────────────
async function openProfileModal(userId) {
  document.getElementById('profile-modal').style.display = 'flex';
  document.getElementById('pm-name').textContent = 'Loading...';
  document.getElementById('pm-meta').textContent = '';
  document.getElementById('pm-bio').textContent = '';
  document.getElementById('pm-sessions').textContent = '—';
  document.getElementById('pm-posts').textContent = '—';
  document.getElementById('pm-streak').textContent = '—';

  const [{ data: profile }, { data: sessions }, { data: posts }] = await Promise.all([
    db.from('profiles').select('*').eq('id', userId).single(),
    db.from('study_sessions').select('start_time, duration_seconds').eq('user_id', userId).eq('status', 'complete'),
    db.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  ]);

  if (!profile) { document.getElementById('pm-name').textContent = 'User not found'; return; }

  const av = document.getElementById('pm-avatar');
  av.innerHTML = profile.avatar_url
    ? '<img src="' + escHtml(profile.avatar_url) + '" alt="' + escHtml(profile.name || '') + '">'
    : '<svg width="28" height="28" style="color:var(--text3)"><use href="#ic-user"/></svg>';

  document.getElementById('pm-name').innerHTML = escHtml(profile.name || 'Anonymous') + roleBadge(profile.role);
  const metaParts = [];
  if (profile.class) metaParts.push(profile.class);
  if (profile.target_year) metaParts.push('Target ' + profile.target_year);
  document.getElementById('pm-meta').textContent = metaParts.join(' · ');
  document.getElementById('pm-bio').textContent = profile.bio || '';
  document.getElementById('pm-sessions').textContent = sessions ? sessions.length : 0;
  document.getElementById('pm-posts').textContent = posts !== null ? posts : 0;

  // Show aura score in profile modal
  if (profile.aura_score !== undefined && profile.aura_score !== null) {
    const auraEl = document.getElementById('pm-aura');
    if (auraEl) {
      auraEl.textContent = `${profile.aura_score} · ${profile.aura_level || ''}`;
    }
  }

  let streak = 0;
  if (sessions && sessions.length) {
    const studyDates = new Set(sessions.map(s => {
      const d = new Date(s.start_time); d.setHours(0,0,0,0); return d.getTime();
    }));
    const today = new Date(); today.setHours(0,0,0,0);
    let check = new Date(today);
    while (studyDates.has(check.getTime())) { streak++; check.setDate(check.getDate() - 1); }
  }
  document.getElementById('pm-streak').textContent = streak + ' 🔥';
}

function closeProfileModal() {
  document.getElementById('profile-modal').style.display = 'none';
}

// ── Helpers ──────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return Math.floor(diff/86400) + 'd ago';
}

// ============================================================
// REDDIT-STYLE COMMENTS MODAL
// ============================================================
async function openComments(postId, event) {
  if (event) event.stopPropagation();
  activePostId = postId;
  const modal = document.getElementById("comment-modal");
  modal.style.display = "flex";
  document.getElementById("comment-input").value = "";
  document.getElementById("modal-post-content").innerHTML =
    '<div class="loading-text">Loading...</div>';
  document.getElementById("comments-list").innerHTML =
    '<div class="loading-text">Loading comments...</div>';
  const voteRow = document.getElementById("modal-vote-row");
  if (voteRow) { voteRow.style.display = "none"; voteRow.innerHTML = ""; }

  const [{ data: post }, { data: comments }, { data: allVotes }, { data: myVoteData }] = await Promise.all([
    db.from("posts").select("*, profiles(id, name, avatar_url, class, target_year, bio, role)").eq("id", postId).single(),
    db.from("comments").select("*, profiles(id, name, avatar_url, role)").eq("post_id", postId).order("created_at", { ascending: true }),
    db.from("votes").select("value").eq("post_id", postId),
    currentUser
      ? db.from("votes").select("value").eq("post_id", postId).eq("user_id", currentUser.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (post) {
    activePostData = post;
    const p = post.profiles || {};
    const av = p.avatar_url
      ? '<img src="' + escHtml(p.avatar_url) + '" alt="' + escHtml(p.name || "User") + '">'
      : '<svg width="16" height="16" style="color:var(--text3)"><use href="#ic-user"/></svg>';

    // Build images HTML using _buildImageGrid if available
    let imagesHtml = '';
    const imgs = _extractPostImages(post);
    if (imgs.length && typeof _buildImageGrid === 'function') {
      imagesHtml = _buildImageGrid(imgs);
    }

    const titleHtml = post.title
      ? '<div class="modal-post-title">' + escHtml(post.title) + '</div>'
      : '';

    document.getElementById("modal-post-content").innerHTML =
      '<div class="modal-post">' +
        '<div class="modal-post-header">' +
          '<button class="post-avatar-btn" onclick="openProfileModal(\'' + (post.user_id || '') + '\')" title="View profile">' +
            '<div class="post-avatar small">' + av + '</div>' +
          '</button>' +
          '<div>' +
            '<button class="post-author-link" onclick="openProfileModal(\'' + (post.user_id || '') + '\')">' +
              escHtml(p.name || "Anonymous") + roleBadge(p.role) +
            '</button>' +
            '<span class="post-time"> · ' + timeAgo(post.created_at) + '</span>' +
          '</div>' +
        '</div>' +
        titleHtml +
        '<div class="modal-post-text">' + escHtml(post.content) + '</div>' +
        imagesHtml +
      '</div>';

    // ── Vote + Report row ─────────────────────────────────
    const totalScore = (allVotes || []).reduce((a, v) => a + v.value, 0);
    const myVote = myVoteData ? myVoteData.value : 0;
    const likeActive    = myVote === 1  ? 'emoji-vote-active' : '';
    const dislikeActive = myVote === -1 ? 'emoji-vote-active' : '';
    if (voteRow) {
      voteRow.innerHTML =
        '<div class="emoji-vote-group">' +
          '<button class="emoji-vote-btn ' + likeActive + '" onclick="castVote(\'' + postId + '\', 1)">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-8 8h6v8h4v-8h6z"/></svg>' +
          '</button>' +
          '<span style="font-size:0.85rem;font-weight:700;color:var(--accent);min-width:28px;text-align:center">' + (totalScore > 0 ? '+' : '') + totalScore + '</span>' +
          '<button class="emoji-vote-btn ' + dislikeActive + '" onclick="castVote(\'' + postId + '\', -1)">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20l8-8h-6V4h-4v8H4z"/></svg>' +
          '</button>' +
        '</div>' +
        '<button class="post-report-btn" style="margin-left:auto" onclick="openReportModal(\'post\', \'' + postId + '\', null)">🚩 Report</button>';
      voteRow.style.display = 'flex';
    }
  }
  renderCommentsInModal(comments || [], await _fetchCommentVoteMap(comments || []));
}

function renderCommentsInModal(comments, commentVoteMap) {
  commentVoteMap = commentVoteMap || {};
  const list = document.getElementById("comments-list");
  if (!comments || comments.length === 0) {
    list.innerHTML =
      '<div class="empty-state" style="padding:2rem"><svg width="28" height="28" style="color:var(--text3);margin-bottom:.4rem"><use href="#ic-chat"/></svg><div>No comments yet — be the first!</div></div>';
    return;
  }
  list.innerHTML = comments
    .map((c) => {
      const name = c.profiles ? c.profiles.name : "Anonymous";
      const profileId = c.profiles ? c.profiles.id : "";
      const profileRole = c.profiles ? c.profiles.role : "";
      const av =
        c.profiles && c.profiles.avatar_url
          ? '<img src="' + escHtml(c.profiles.avatar_url) + '" alt="' + escHtml(name) + '">'
          : '<svg width="14" height="14" style="color:var(--text3)"><use href="#ic-user"/></svg>';
      const avatarEl = profileId
        ? '<button class="post-avatar-btn" onclick="openProfileModal(\'' + profileId + '\')" title="View profile"><div class="comment-avatar">' + av + '</div></button>'
        : '<div class="comment-avatar">' + av + '</div>';
      const nameEl = profileId
        ? '<button class="post-author-link" style="font-size:0.82rem" onclick="openProfileModal(\'' + profileId + '\')">' + escHtml(name) + roleBadge(profileRole) + '</button>'
        : '<span class="comment-author-name">' + escHtml(name) + roleBadge(profileRole) + '</span>';

      // Comment image
      const imgHtml = _buildCommentImageHtml(c);

      // Comment votes
      const voteData = commentVoteMap[c.id] || { score: 0, myVote: 0 };
      const cvLikeActive    = voteData.myVote ===  1 ? 'emoji-vote-active' : '';
      const cvDislikeActive = voteData.myVote === -1 ? 'emoji-vote-active' : '';
      const scoreDisplay = voteData.score !== 0
        ? '<span class="comment-vote-score ' + (voteData.score > 0 ? 'score-pos' : 'score-neg') + '">' + (voteData.score > 0 ? '+' : '') + voteData.score + '</span>'
        : '';
      const voteHtml =
        '<div class="comment-vote-group" id="cvg-' + c.id + '">' +
          '<button class="comment-vote-btn ' + cvLikeActive + '" onclick="castCommentVote(\'' + c.id + '\', 1, \'modal\')" title="Upvote">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-8 8h6v8h4v-8h6z"/></svg>' +
          '</button>' +
          scoreDisplay +
          '<button class="comment-vote-btn ' + cvDislikeActive + '" onclick="castCommentVote(\'' + c.id + '\', -1, \'modal\')" title="Downvote">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20l8-8h-6V4h-4v8H4z"/></svg>' +
          '</button>' +
        '</div>';

      return (
        '<div class="comment-item" id="comment-' + c.id + '">' +
        avatarEl +
        '<div class="comment-content">' +
        '<div class="comment-author">' +
        nameEl +
        ' <span class="comment-time">' + timeAgo(c.created_at) + '</span>' +
        '</div>' +
        '<div class="comment-text">' + escHtml(c.content) + '</div>' +
        imgHtml +
        '<div class="comment-actions">' +
        voteHtml +
        '<button class="comment-action-btn" onclick="openReportModal(\'comment\', null, \'' + c.id + '\')">🚩 Report</button>' +
        (canModerate()
          ? '<button class="comment-action-btn mod-btn" onclick="modDeleteComment(\'' + c.id + '\')">🗑️ Delete</button>'
          : '') +
        (canModerate() && profileRole !== "admin" && profileId
          ? '<button class="comment-action-btn mod-btn" onclick="openMuteModal(\'' + profileId + "', '" + escHtml(name).replace(/'/g, "\\'") + '\')">🔇 Mute</button>'
          : '') +
        '</div>' +
        '</div>' +
        '</div>'
      );
    })
    .join("");
}

function closeCommentModal() {
  document.getElementById("comment-modal").style.display = "none";
  const voteRow = document.getElementById("modal-vote-row");
  if (voteRow) { voteRow.style.display = "none"; voteRow.innerHTML = ""; }
  activePostId = null;
  activePostData = null;
}

// ============================================================
// REPORT MODAL
// ============================================================
let reportTarget = { type: null, postId: null, commentId: null };

function openReportModal(type, postId, commentId) {
  if (!currentUser) return showToast("Sign in to report");
  reportTarget = { type, postId, commentId };
  document.getElementById("report-reason").value = "";
  document.getElementById("report-modal").style.display = "flex";
}

function closeReportModal() {
  document.getElementById("report-modal").style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
  const submitBtn = document.getElementById("submit-report-btn");
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const reason = document.getElementById("report-reason").value;
      if (!reason) return showToast("Please select a reason");
      submitBtn.disabled = true;

      // Insert the report
      const { error } = await db.from("reports").insert({
        reporter_id: currentUser.id,
        reason,
        post_id: reportTarget.postId || null,
        comment_id: reportTarget.commentId || null,
      });

      if (error) {
        submitBtn.disabled = false;
        return showToast("Error: " + error.message);
      }

      // Notify admins — find all admins and send them a notification
      const { data: admins } = await db
        .from("profiles")
        .select("id")
        .eq("role", "admin");

      if (admins && admins.length > 0) {
        const reporterName = currentProfile ? currentProfile.name : "Someone";
        const targetLabel = reportTarget.postId ? "a post" : "a comment";
        const notifRows = admins.map((a) => ({
          title: "🚩 New Report",
          message:
            reporterName + " reported " + targetLabel + ': "' + reason + '"',
          user_id: a.id,
        }));
        await db.from("notifications").insert(notifRows);
      }

      submitBtn.disabled = false;
      closeReportModal();
      showToast("✅ Report submitted. Thank you!");
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  // Comment submit button
  const commentSubmitBtn = document.getElementById('submit-comment-btn');
  if (commentSubmitBtn) {
    commentSubmitBtn.addEventListener('click', () => {
      if (activePostId) submitComment(activePostId);
    });
  }

  // Comment input — Enter key se bhi submit ho
  const commentInput = document.getElementById('comment-input');
  if (commentInput) {
    commentInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (activePostId) submitComment(activePostId);
      }
    });
  }
});
// ============================================================
// HELPER: extract image array from a post object
// Handles image_urls (array or JSON string) and legacy image_url
// ============================================================
function _extractPostImages(post) {
  if (!post) return [];
  if (Array.isArray(post.image_urls) && post.image_urls.length) return post.image_urls;
  if (typeof post.image_urls === 'string' && post.image_urls.length > 2) {
    try { return JSON.parse(post.image_urls); } catch (e) {}
  }
  if (post.image_url) return [post.image_url];
  return [];
}

// ============================================================
// POPULAR POSTS SIDEBAR
// Shows posts with 10+ upvotes in the right sidebar.
// Clicking opens a full modal with comments + vote buttons.
// ============================================================

let popularPostActiveId = null;

async function loadPopularPosts() {
  const container = document.getElementById('popular-posts-list');
  if (!container) return;

  container.innerHTML = '<div class="popular-posts-loading">Loading...</div>';

  // Fetch all votes to compute scores
  const { data: allVotes } = await db.from('votes').select('post_id, value');
  if (!allVotes) {
    container.innerHTML = '<div class="popular-posts-empty">No popular posts yet</div>';
    return;
  }

  // Build score map
  const scoreMap = {};
  allVotes.forEach(v => {
    scoreMap[v.post_id] = (scoreMap[v.post_id] || 0) + v.value;
  });

  // Filter post IDs with score >= 10
  const popularIds = Object.keys(scoreMap).filter(id => scoreMap[id] >= 10);

  if (popularIds.length === 0) {
    container.innerHTML = '<div class="popular-posts-empty">No popular posts yet.<br><span style="font-size:0.7rem;color:var(--text3)">Posts with 10+ upvotes appear here</span></div>';
    return;
  }

  // Fetch those posts
  const { data: posts } = await db.from('posts')
    .select('*, profiles(id, name, avatar_url, role)')
    .in('id', popularIds)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!posts || posts.length === 0) {
    container.innerHTML = '<div class="popular-posts-empty">No popular posts yet</div>';
    return;
  }

  // Sort by score desc
  posts.sort((a, b) => (scoreMap[b.id] || 0) - (scoreMap[a.id] || 0));

  container.innerHTML = posts.map(post => {
    const p = post.profiles || {};
    const score = scoreMap[post.id] || 0;
    const avatarHtml = p.avatar_url
      ? '<img src="' + escHtml(p.avatar_url) + '" alt="' + escHtml(p.name || 'User') + '">'
      : '<svg width="12" height="12" style="color:var(--text3)"><use href="#ic-user"/></svg>';
    const titleText = post.title ? post.title : (post.content.substring(0, 50) + (post.content.length > 50 ? '...' : ''));
    const excerpt = post.content.substring(0, 80) + (post.content.length > 80 ? '...' : '');

    return '<button class="popular-post-item" onclick="openPopularPostModal(\'' + post.id + '\')">' +
      '<div class="popular-post-meta">' +
        '<div class="popular-post-avatar">' + avatarHtml + '</div>' +
        '<span class="popular-post-author">' + escHtml(p.name || 'Anonymous') + '</span>' +
        '<span class="popular-post-score">▲ ' + score + '</span>' +
      '</div>' +
      (post.title ? '<div class="popular-post-title">' + escHtml(post.title) + '</div>' : '') +
      '<div class="popular-post-excerpt">' + escHtml(excerpt) + '</div>' +
    '</button>';
  }).join('');
}

async function openPopularPostModal(postId) {
  popularPostActiveId = postId;
  const modal = document.getElementById('popular-post-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  document.getElementById('popular-modal-post-content').innerHTML = '<div class="loading-text">Loading...</div>';
  document.getElementById('popular-comments-list').innerHTML = '<div class="loading-text">Loading comments...</div>';
  document.getElementById('popular-modal-vote-row').innerHTML = '';
  if (document.getElementById('popular-comment-input')) document.getElementById('popular-comment-input').value = '';

  const [{ data: post }, { data: comments }, { data: votes }] = await Promise.all([
    db.from('posts').select('*, profiles(id, name, avatar_url, class, target_year, bio, role)').eq('id', postId).single(),
    db.from('comments').select('*, profiles(id, name, avatar_url, role)').eq('post_id', postId).order('created_at', { ascending: true }),
    db.from('votes').select('post_id, value').eq('post_id', postId)
  ]);

  let myVote = 0;
  let totalScore = 0;
  if (votes) {
    votes.forEach(v => { totalScore += v.value; });
    if (currentUser) {
      const { data: mv } = await db.from('votes').select('value').eq('post_id', postId).eq('user_id', currentUser ? currentUser.id : '').maybeSingle();
      if (mv) myVote = mv.value;
    }
  }

  if (post) {
    const p = post.profiles || {};
    const av = p.avatar_url
      ? '<img src="' + escHtml(p.avatar_url) + '" alt="' + escHtml(p.name || 'User') + '">'
      : '<svg width="16" height="16" style="color:var(--text3)"><use href="#ic-user"/></svg>';

    // Images
    let imagesHtml = '';
    const imgs = _extractPostImages(post);
    if (imgs.length && typeof _buildImageGrid === 'function') {
      imagesHtml = _buildImageGrid(imgs);
    }

    const titleHtml = post.title ? '<div class="modal-post-title">' + escHtml(post.title) + '</div>' : '';

    document.getElementById('popular-modal-post-content').innerHTML =
      '<div class="modal-post">' +
        '<div class="modal-post-header">' +
          '<button class="post-avatar-btn" onclick="openProfileModal(\'' + (post.user_id || '') + '\')" title="View profile">' +
            '<div class="post-avatar small">' + av + '</div>' +
          '</button>' +
          '<div>' +
            '<button class="post-author-link" onclick="openProfileModal(\'' + (post.user_id || '') + '\')">' +
              escHtml(p.name || 'Anonymous') + roleBadge(p.role) +
            '</button>' +
            '<span class="post-time"> · ' + timeAgo(post.created_at) + '</span>' +
          '</div>' +
        '</div>' +
        titleHtml +
        '<div class="modal-post-text">' + escHtml(post.content) + '</div>' +
        imagesHtml +
      '</div>';

    // Vote + report row
    const likeActive   = myVote === 1  ? 'emoji-vote-active' : '';
    const dislikeActive = myVote === -1 ? 'emoji-vote-active' : '';

    document.getElementById('popular-modal-vote-row').innerHTML =
      '<div class="emoji-vote-group">' +
        '<button class="emoji-vote-btn ' + likeActive + '" onclick="castVoteInPopular(\'' + postId + '\', 1)">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-8 8h6v8h4v-8h6z"/></svg>' +
        '</button>' +
        '<span style="font-size:0.85rem;font-weight:700;color:var(--accent);min-width:28px;text-align:center">' + (totalScore > 0 ? '+' : '') + totalScore + '</span>' +
        '<button class="emoji-vote-btn ' + dislikeActive + '" onclick="castVoteInPopular(\'' + postId + '\', -1)">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20l8-8h-6V4h-4v8H4z"/></svg>' +
        '</button>' +
      '</div>' +
      '<button class="post-report-btn" style="margin-left:auto" onclick="openReportModal(\'post\', \'' + postId + '\', null)">🚩 Report</button>';
  }

  // Render comments
  const voteMap = await _fetchCommentVoteMap(comments || []);
  renderPopularModalComments(comments || [], voteMap);
}

function renderPopularModalComments(comments, commentVoteMap) {
  commentVoteMap = commentVoteMap || {};
  const list = document.getElementById('popular-comments-list');
  if (!list) return;
  if (!comments || comments.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:2rem"><svg width="28" height="28" style="color:var(--text3);margin-bottom:.4rem"><use href="#ic-chat"/></svg><div>No comments yet — be the first!</div></div>';
    return;
  }
  list.innerHTML = comments.map(c => {
    const name = c.profiles ? c.profiles.name : 'Anonymous';
    const profileId = c.profiles ? c.profiles.id : '';
    const profileRole = c.profiles ? c.profiles.role : '';
    const av = c.profiles && c.profiles.avatar_url
      ? '<img src="' + escHtml(c.profiles.avatar_url) + '" alt="' + escHtml(name) + '">'
      : '<svg width="14" height="14" style="color:var(--text3)"><use href="#ic-user"/></svg>';
    const avatarEl = profileId
      ? '<button class="post-avatar-btn" onclick="openProfileModal(\'' + profileId + '\')" title="View profile"><div class="comment-avatar">' + av + '</div></button>'
      : '<div class="comment-avatar">' + av + '</div>';
    const nameEl = profileId
      ? '<button class="post-author-link" style="font-size:0.82rem" onclick="openProfileModal(\'' + profileId + '\')">' + escHtml(name) + roleBadge(profileRole) + '</button>'
      : '<span>' + escHtml(name) + roleBadge(profileRole) + '</span>';

    const imgHtml = _buildCommentImageHtml(c);

    const voteData = commentVoteMap[c.id] || { score: 0, myVote: 0 };
    const cvLikeActive    = voteData.myVote ===  1 ? 'emoji-vote-active' : '';
    const cvDislikeActive = voteData.myVote === -1 ? 'emoji-vote-active' : '';
    const scoreDisplay = voteData.score !== 0
      ? '<span class="comment-vote-score ' + (voteData.score > 0 ? 'score-pos' : 'score-neg') + '">' + (voteData.score > 0 ? '+' : '') + voteData.score + '</span>'
      : '';
    const voteHtml =
      '<div class="comment-vote-group" id="cvg-pop-' + c.id + '">' +
        '<button class="comment-vote-btn ' + cvLikeActive + '" onclick="castCommentVote(\'' + c.id + '\', 1, \'popular\')" title="Upvote">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-8 8h6v8h4v-8h6z"/></svg>' +
        '</button>' +
        scoreDisplay +
        '<button class="comment-vote-btn ' + cvDislikeActive + '" onclick="castCommentVote(\'' + c.id + '\', -1, \'popular\')" title="Downvote">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20l8-8h-6V4h-4v8H4z"/></svg>' +
        '</button>' +
      '</div>';

    return '<div class="comment-item" id="pop-comment-' + c.id + '">' +
      avatarEl +
      '<div class="comment-content">' +
        '<div class="comment-author">' +
          nameEl +
          ' <span class="comment-time">' + timeAgo(c.created_at) + '</span>' +
        '</div>' +
        '<div class="comment-text">' + escHtml(c.content) + '</div>' +
        imgHtml +
        '<div class="comment-actions">' +
          voteHtml +
          '<button class="comment-action-btn" onclick="openReportModal(\'comment\', null, \'' + c.id + '\')">🚩 Report</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function castVoteInPopular(postId, value) {
  if (!currentUser) return showToast('Sign in to vote');
  const { data: existing } = await db.from('votes').select('id, value').eq('post_id', postId).eq('user_id', currentUser.id).maybeSingle();
  if (existing) {
    if (existing.value === value) await db.from('votes').delete().eq('id', existing.id);
    else await db.from('votes').update({ value }).eq('id', existing.id);
  } else {
    await db.from('votes').insert({ post_id: postId, user_id: currentUser.id, value });
  }
  // Refresh the modal vote row
  openPopularPostModal(postId);
  loadPosts();
}

function closePopularPostModal() {
  const modal = document.getElementById('popular-post-modal');
  if (modal) modal.style.display = 'none';
  popularPostActiveId = null;
}

function handlePopularModalClick(e) {
  if (e.target === document.getElementById('popular-post-modal')) closePopularPostModal();
}

// Wire up popular comment submit
document.addEventListener('DOMContentLoaded', () => {
  const submitBtn = document.getElementById('popular-submit-comment-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      if (popularPostActiveId) submitPopularComment(popularPostActiveId);
    });
  }
  const input = document.getElementById('popular-comment-input');
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (popularPostActiveId) submitPopularComment(popularPostActiveId);
      }
    });
  }
});

async function submitPopularComment(postId) {
  if (!currentUser) return showToast('Sign in to comment');
  const input = document.getElementById('popular-comment-input');
  const content = (input ? input.value : '').trim();
  const pendingUrl = window._popularCommentImageUrl || null;

  if (!content && !pendingUrl) return showToast('Write a comment or add an image first!');
  if (window._popularCommentImageUploading) return showToast('Image still uploading, please wait...');

  const btn = document.getElementById('popular-submit-comment-btn');
  if (btn) btn.disabled = true;

  try {
    const payload = { post_id: postId, content: content || ' ' };
    if (pendingUrl) payload.image_url = pendingUrl;
    await callEdge('add-comment', payload);
    if (input) input.value = '';
    _clearPopularCommentImage();
    const { data: comments } = await db.from('comments')
      .select('*, profiles(id, name, avatar_url, role)')
      .eq('post_id', postId).order('created_at', { ascending: true });
    const voteMap = await _fetchCommentVoteMap(comments || []);
    renderPopularModalComments(comments || [], voteMap);
    loadPosts();
  } catch (err) {
    showToast('❌ ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}
// ============================================================
// COMMENT IMAGE HELPERS
// ============================================================

/**
 * Builds the HTML for a comment's attached image (if any).
 * Reuses the existing lightbox (openPostLightbox).
 */
function _buildCommentImageHtml(c) {
  const url = c.image_url || null;
  if (!url) return '';
  const thumb = typeof getOptimizedUrl === 'function'
    ? getOptimizedUrl(url, 'w_600,q_auto,f_auto')
    : url;
  const full = typeof getOptimizedUrl === 'function'
    ? getOptimizedUrl(url, 'w_1800,q_auto,f_auto')
    : url;
  return (
    '<div class="comment-image-wrap">' +
      '<img src="' + escHtml(thumb) + '" alt="Comment image" class="comment-img" ' +
        'onclick="openPostLightbox([\'' + escHtml(full).replace(/'/g, "\\'") + '\'], 0)" ' +
        'loading="lazy">' +
    '</div>'
  );
}

// ============================================================
// COMMENT VOTES
// ============================================================

/**
 * Fetches comment_votes for the given comments and returns a map:
 * { [commentId]: { score: number, myVote: -1|0|1 } }
 */
async function _fetchCommentVoteMap(comments) {
  if (!comments || comments.length === 0) return {};
  const ids = comments.map(c => c.id);

  const [{ data: allVotes }, { data: myVotes }] = await Promise.all([
    db.from('comment_votes').select('comment_id, value').in('comment_id', ids),
    currentUser
      ? db.from('comment_votes').select('comment_id, value').eq('user_id', currentUser.id).in('comment_id', ids)
      : Promise.resolve({ data: [] }),
  ]);

  const scoreMap = {};
  (allVotes || []).forEach(v => {
    scoreMap[v.comment_id] = (scoreMap[v.comment_id] || 0) + v.value;
  });
  const myVoteMap = {};
  (myVotes || []).forEach(v => { myVoteMap[v.comment_id] = v.value; });

  const result = {};
  ids.forEach(id => {
    result[id] = { score: scoreMap[id] || 0, myVote: myVoteMap[id] || 0 };
  });
  return result;
}

/**
 * Cast/toggle a vote on a comment.
 * context: 'modal' | 'popular'
 */
async function castCommentVote(commentId, value, context) {
  if (!currentUser) return showToast('Sign in to vote');

  const { data: existing } = await db.from('comment_votes')
    .select('id, value').eq('comment_id', commentId).eq('user_id', currentUser.id).maybeSingle();

  if (existing) {
    if (existing.value === value) {
      await db.from('comment_votes').delete().eq('id', existing.id);
    } else {
      await db.from('comment_votes').update({ value }).eq('id', existing.id);
    }
  } else {
    await db.from('comment_votes').insert({ comment_id: commentId, user_id: currentUser.id, value });
  }

  // Refresh only the affected comment's vote display (optimistic re-render)
  const postId = context === 'popular' ? popularPostActiveId : activePostId;
  if (!postId) return;

  const { data: comments } = await db.from('comments')
    .select('*, profiles(id, name, avatar_url, role)')
    .eq('post_id', postId).order('created_at', { ascending: true });
  const voteMap = await _fetchCommentVoteMap(comments || []);

  if (context === 'popular') {
    renderPopularModalComments(comments || [], voteMap);
  } else {
    renderCommentsInModal(comments || [], voteMap);
  }
}

// ============================================================
// COMMENT IMAGE PICKER — injected into both modals on DOM ready
// ============================================================

// State for main comment modal
window._commentImageUrl        = null;
window._commentImageUploading  = false;

// State for popular post modal
window._popularCommentImageUrl       = null;
window._popularCommentImageUploading = false;

function _clearCommentImage() {
  window._commentImageUrl = null;
  window._commentImageUploading = false;
  const prev = document.getElementById('comment-img-preview');
  if (prev) prev.innerHTML = '';
  const inp = document.getElementById('comment-image-input');
  if (inp) inp.value = '';
}

function _clearPopularCommentImage() {
  window._popularCommentImageUrl = null;
  window._popularCommentImageUploading = false;
  const prev = document.getElementById('popular-comment-img-preview');
  if (prev) prev.innerHTML = '';
  const inp = document.getElementById('popular-comment-image-input');
  if (inp) inp.value = '';
}

/**
 * Generic handler: uploads the chosen file to Cloudinary and stores the URL.
 */
function _handleCommentImagePick(file, previewEl, isPopular) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Only image files allowed'); return; }
  if (file.size > 1 * 1024 * 1024) { showToast('Image must be under 1MB'); return; }

  if (isPopular) {
    window._popularCommentImageUrl = null;
    window._popularCommentImageUploading = true;
  } else {
    window._commentImageUrl = null;
    window._commentImageUploading = true;
  }

  // Show local preview immediately
  const reader = new FileReader();
  reader.onload = function(e) {
    if (!previewEl) return;
    previewEl.innerHTML =
      '<div class="comment-img-preview-wrap">' +
        '<img src="' + e.target.result + '" alt="preview">' +
        '<button class="comment-img-remove-btn" onclick="' + (isPopular ? '_clearPopularCommentImage' : '_clearCommentImage') + '()" title="Remove">×</button>' +
        '<div class="comment-img-uploading-label" id="' + (isPopular ? 'pop-' : '') + 'cimg-upload-label">Uploading…</div>' +
      '</div>';
  };
  reader.readAsDataURL(file);

  // Upload
  uploadImageToCloudinary(file, { maxSizeMB: 1, folder: 'study_aura/comments' })
    .then(function(url) {
      const optimized = typeof getOptimizedUrl === 'function'
        ? getOptimizedUrl(url, 'w_1200,q_auto,f_auto')
        : url;
      if (isPopular) {
        window._popularCommentImageUrl = optimized;
        window._popularCommentImageUploading = false;
      } else {
        window._commentImageUrl = optimized;
        window._commentImageUploading = false;
      }
      const label = document.getElementById((isPopular ? 'pop-' : '') + 'cimg-upload-label');
      if (label) label.textContent = '✓ Ready';
    })
    .catch(function(err) {
      showToast('Image upload failed: ' + err.message);
      if (isPopular) _clearPopularCommentImage();
      else _clearCommentImage();
    });
}

document.addEventListener('DOMContentLoaded', function() {
  // ── Wire up main comment modal image picker ──
  const cimgInput = document.getElementById('comment-image-input');
  const cimgBtn   = document.getElementById('comment-image-btn');
  const cimgPrev  = document.getElementById('comment-img-preview');
  if (cimgInput) {
    cimgInput.style.display = 'none';
    if (cimgBtn) {
      cimgBtn.addEventListener('click', function() { cimgInput.click(); });
    }
    cimgInput.addEventListener('change', function() {
      _handleCommentImagePick(this.files[0], cimgPrev, false);
      this.value = '';
    });
  }

  // ── Wire up popular modal image picker ──
  const pcimgInput = document.getElementById('popular-comment-image-input');
  const pcimgBtn   = document.getElementById('popular-comment-image-btn');
  const pcimgPrev  = document.getElementById('popular-comment-img-preview');
  if (pcimgInput) {
    pcimgInput.style.display = 'none';
    if (pcimgBtn) {
      pcimgBtn.addEventListener('click', function() { pcimgInput.click(); });
    }
    pcimgInput.addEventListener('change', function() {
      _handleCommentImagePick(this.files[0], pcimgPrev, true);
      this.value = '';
    });
  }
});