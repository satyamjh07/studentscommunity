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
  list.innerHTML = '<div class="loading-text">Loading posts...</div>';

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
  if (!content) return showToast('Write a comment first!');

  const btn = document.getElementById('comment-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Posting...'; }

  try {
    await callEdge('add-comment', { post_id: postId, content });
    if (input) input.value = '';
    // Refresh comments in modal
    if (activePostId) {
      const { data: comments } = await db.from('comments')
        .select('*, profiles(id, name, avatar_url, role)')
        .eq('post_id', activePostId).order('created_at', { ascending: true });
      renderCommentsInModal(comments || []);
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

  const [{ data: post }, { data: comments }] = await Promise.all([
    db
      .from("posts")
      .select(
        "*, profiles(id, name, avatar_url, class, target_year, bio, role)",
      )
      .eq("id", postId)
      .single(),
    db
      .from("comments")
      .select("*, profiles(id, name, avatar_url, role)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true }),
  ]);

  if (post) {
    activePostData = post;
    const p = post.profiles || {};
    const av = p.avatar_url
      ? '<img src="' +
        escHtml(p.avatar_url) +
        '" alt="' +
        escHtml(p.name || "User") +
        '">'
      : '<svg width="16" height="16" style="color:var(--text3)"><use href="#ic-user"/></svg>';
    document.getElementById("modal-post-content").innerHTML =
      '<div class="modal-post">' +
      '<div class="modal-post-header">' +
      '<div class="post-avatar small">' +
      av +
      "</div>" +
      '<div><span class="post-author-name">' +
      escHtml(p.name || "Anonymous") +
      roleBadge(p.role) +
      "</span>" +
      '<span class="post-time"> · ' +
      timeAgo(post.created_at) +
      "</span></div>" +
      "</div>" +
      '<div class="modal-post-text">' +
      escHtml(post.content) +
      "</div>" +
      "</div>";
  }
  renderCommentsInModal(comments || []);
}

function renderCommentsInModal(comments) {
  const list = document.getElementById("comments-list");
  if (!comments || comments.length === 0) {
    list.innerHTML =
      '<div class="empty-state" style="padding:2rem"><svg width="28" height="28" style="color:var(--text3);margin-bottom:.4rem"><use href="#ic-chat"/></svg><div>No comments yet — be the first!</div></div>';
    return;
  }
  list.innerHTML = comments
    .map((c) => {
      const name = c.profiles ? c.profiles.name : "Anonymous";
      const av =
        c.profiles && c.profiles.avatar_url
          ? '<img src="' +
            escHtml(c.profiles.avatar_url) +
            '" alt="' +
            escHtml(name) +
            '">'
          : '<svg width="14" height="14" style="color:var(--text3)"><use href="#ic-user"/></svg>';
      const profileId = c.profiles ? c.profiles.id : "";
      const profileRole = c.profiles ? c.profiles.role : "";
      return (
        '<div class="comment-item" id="comment-' +
        c.id +
        '">' +
        '<div class="comment-avatar">' +
        av +
        "</div>" +
        '<div class="comment-content">' +
        '<div class="comment-author">' +
        escHtml(name) +
        roleBadge(profileRole) +
        ' <span class="comment-time">' +
        timeAgo(c.created_at) +
        "</span>" +
        "</div>" +
        '<div class="comment-text">' +
        escHtml(c.content) +
        "</div>" +
        '<div class="comment-actions">' +
        "<button class=\"comment-action-btn\" onclick=\"openReportModal('comment', null, '" +
        c.id +
        "')\">🚩 Report</button>" +
        (canModerate()
          ? '<button class="comment-action-btn mod-btn" onclick="modDeleteComment(\'' +
            c.id +
            "')\">🗑️ Delete</button>"
          : "") +
        (canModerate() && profileRole !== "admin" && profileId
          ? '<button class="comment-action-btn mod-btn" onclick="openMuteModal(\'' +
            profileId +
            "', '" +
            escHtml(name).replace(/'/g, "\\'") +
            "')\">🔇 Mute</button>"
          : "") +
        "</div>" +
        "</div>" +
        "</div>"
      );
    })
    .join("");
}

function closeCommentModal() {
  document.getElementById("comment-modal").style.display = "none";
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