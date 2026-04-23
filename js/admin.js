// ============================================
// STUDY AURA — ADMIN PANEL
// Accessible only to users with role = 'admin'
// ============================================

async function loadAdminPanel() {
  if (!currentProfile || currentProfile.role !== 'admin') return;

  document.getElementById('admin-stat-users').textContent = '…';
  document.getElementById('admin-stat-posts').textContent = '…';
  document.getElementById('admin-stat-reports').textContent = '…';

  const [
    { count: userCount },
    { count: postCount },
    { count: reportCount }
  ] = await Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('posts').select('id', { count: 'exact', head: true }),
    db.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  ]);

  document.getElementById('admin-stat-users').textContent = userCount || 0;
  document.getElementById('admin-stat-posts').textContent = postCount || 0;
  document.getElementById('admin-stat-reports').textContent = reportCount || 0;

  loadAdminReports();
  loadAdminUsers();
  loadAdminPosts();
}

// ---- Tab switching ----
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('admin-tab-' + btn.dataset.tab).classList.add('active');
    });
  });
});

// ---- Reports ----
async function loadAdminReports() {
  const list = document.getElementById('admin-reports-list');
  if (!list) return;
  list.innerHTML = '<div class="loading-text">Loading reports...</div>';

  const { data: reports, error } = await db.from('reports')
    .select('*, reporter:reporter_id(name), post:post_id(id, content, user_id), comment:comment_id(id, content, user_id)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !reports || reports.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:2rem">No reports yet 🎉</div>';
    return;
  }

  list.innerHTML = reports.map(r => {
    const targetContent = r.post ? r.post.content : (r.comment ? r.comment.content : 'Deleted content');
    const targetType = r.post ? 'Post' : 'Comment';
    const statusClass = r.status === 'pending' ? 'badge-pending' : r.status === 'resolved' ? 'badge-resolved' : 'badge-dismissed';
    const snippet = (targetContent || '').substring(0, 120) + ((targetContent || '').length > 120 ? '…' : '');
    return '<div class="admin-report-card" id="report-card-' + r.id + '">' +
      '<div class="admin-report-header">' +
        '<span class="report-type-badge">' + targetType + '</span>' +
        '<span class="report-status-badge ' + statusClass + '">' + r.status + '</span>' +
        '<span class="admin-report-time">' + timeAgo(r.created_at) + '</span>' +
      '</div>' +
      '<div class="admin-report-content">' +
        '<div class="admin-report-target">"' + escHtml(snippet) + '"</div>' +
        '<div class="admin-report-reason"><strong>Reason:</strong> ' + escHtml(r.reason) + '</div>' +
        '<div class="admin-report-reporter">Reported by: ' + escHtml(r.reporter ? r.reporter.name : 'Anonymous') + '</div>' +
      '</div>' +
      (r.status === 'pending' ? '<div class="admin-report-actions">' +
        (r.post ? '<button class="btn-danger-sm" onclick="adminDeleteReportedPost(\'' + r.post.id + '\', \'' + r.id + '\')">🗑️ Delete Post</button>' : '') +
        (r.comment ? '<button class="btn-danger-sm" onclick="adminDeleteReportedComment(\'' + r.comment.id + '\', \'' + r.id + '\')">🗑️ Delete Comment</button>' : '') +
        '<button class="btn-secondary-sm" onclick="adminResolveReport(\'' + r.id + '\', \'resolved\')">✅ Resolve</button>' +
        '<button class="btn-secondary-sm" onclick="adminResolveReport(\'' + r.id + '\', \'dismissed\')">❌ Dismiss</button>' +
      '</div>' : '') +
    '</div>';
  }).join('');
}

async function adminDeleteReportedPost(postId, reportId) {
  if (!confirm('Delete this post and all its comments?')) return;
  const { error } = await db.from('posts').delete().eq('id', postId);
  if (error) return showToast('Error: ' + error.message);
  await db.from('reports').update({ status: 'resolved', resolved_by: currentUser.id }).eq('id', reportId);
  showToast('✅ Post deleted & report resolved');
  loadAdminReports();
  loadAdminPosts();
  refreshAdminReportCount();
}

async function adminDeleteReportedComment(commentId, reportId) {
  if (!confirm('Delete this comment?')) return;
  const { error } = await db.from('comments').delete().eq('id', commentId);
  if (error) return showToast('Error: ' + error.message);
  await db.from('reports').update({ status: 'resolved', resolved_by: currentUser.id }).eq('id', reportId);
  showToast('✅ Comment deleted & report resolved');
  loadAdminReports();
  refreshAdminReportCount();
}

async function adminResolveReport(reportId, status) {
  await db.from('reports').update({ status, resolved_by: currentUser.id }).eq('id', reportId);
  showToast(status === 'resolved' ? '✅ Marked resolved' : '❌ Dismissed');
  loadAdminReports();
  refreshAdminReportCount();
}

async function refreshAdminReportCount() {
  const { count } = await db.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  const el = document.getElementById('admin-stat-reports');
  if (el) el.textContent = count || 0;
}

// ---- Users management ----
async function loadAdminUsers() {
  const list = document.getElementById('admin-users-list');
  if (!list) return;
  list.innerHTML = '<div class="loading-text">Loading users...</div>';

  const { data: users, error } = await db.from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !users) {
    list.innerHTML = '<div class="empty-state">Failed to load users</div>';
    return;
  }

  const rows = users.map(u => {
    const av = u.avatar_url ? '<img src="' + escHtml(u.avatar_url) + '" alt="">' : '👤';
    const muteLabel = u.muted_until && new Date(u.muted_until) > new Date()
      ? '<span class="mute-active-badge">Muted until ' + new Date(u.muted_until).toLocaleTimeString() + '</span>'
      : '';
    const isSelf = u.id === currentUser.id;
    return '<tr id="user-row-' + u.id + '">' +
      '<td><div class="admin-user-cell">' +
        '<div class="admin-user-avatar">' + av + '</div>' +
        '<div><div class="admin-user-name">' + escHtml(u.name || 'No name') + '</div>' +
        '<div class="admin-user-email">' + escHtml(u.email || '') + '</div></div>' +
      '</div></td>' +
      '<td>' + escHtml(u.class || '—') + '</td>' +
      '<td><span class="role-badge ' + (u.role === 'admin' ? 'badge-admin' : u.role === 'mod' ? 'badge-mod' : 'badge-member') + '">' + (u.role || 'member') + '</span></td>' +
      '<td>' + new Date(u.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) + '</td>' +
      '<td>' +
        '<select class="role-select" onchange="changeUserRole(\'' + u.id + '\', this.value)" ' + (isSelf ? 'disabled' : '') + '>' +
          '<option value="member" ' + (!u.role || u.role === 'member' ? 'selected' : '') + '>Member</option>' +
          '<option value="mod" ' + (u.role === 'mod' ? 'selected' : '') + '>Mod</option>' +
          '<option value="admin" ' + (u.role === 'admin' ? 'selected' : '') + '>Admin</option>' +
        '</select>' +
        muteLabel +
      '</td>' +
    '</tr>';
  }).join('');

  list.innerHTML = '<table class="admin-table">' +
    '<thead><tr><th>User</th><th>Class</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

async function changeUserRole(userId, newRole) {
  const { error } = await db.from('profiles').update({ role: newRole }).eq('id', userId);
  if (error) { showToast('Error: ' + error.message); loadAdminUsers(); return; }
  showToast('✅ Role updated to ' + newRole);
  loadAdminUsers();
}

// ---- Posts management ----
async function loadAdminPosts() {
  const list = document.getElementById('admin-posts-list');
  if (!list) return;
  list.innerHTML = '<div class="loading-text">Loading posts...</div>';

  const { data: posts, error } = await db.from('posts')
    .select('*, profiles(name, role)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !posts || posts.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:2rem">No posts yet</div>';
    return;
  }

  list.innerHTML = posts.map(p => {
    const authorName = p.profiles ? p.profiles.name : 'Unknown';
    const authorRole = p.profiles ? p.profiles.role : '';
    const snippet = p.content.substring(0, 200) + (p.content.length > 200 ? '…' : '');
    return '<div class="admin-post-row">' +
      '<div class="admin-post-info">' +
        '<span class="admin-post-author">' + escHtml(authorName) + roleBadge(authorRole) + '</span>' +
        '<span class="admin-post-time">' + timeAgo(p.created_at) + '</span>' +
      '</div>' +
      '<div class="admin-post-content">' + escHtml(snippet) + '</div>' +
      '<button class="btn-danger-sm" onclick="adminDirectDeletePost(\'' + p.id + '\')">🗑️ Delete Post</button>' +
    '</div>';
  }).join('');
}

async function adminDirectDeletePost(postId) {
  if (!confirm('Delete this post and all its comments?')) return;
  const { error } = await db.from('posts').delete().eq('id', postId);
  if (error) return showToast('Error: ' + error.message);
  showToast('✅ Post deleted');
  loadAdminPosts();
  const el = document.getElementById('admin-stat-posts');
  if (el) el.textContent = parseInt(el.textContent || 0) - 1;
}