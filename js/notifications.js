// ============================================
// STUDY AURA — NOTIFICATIONS (v3 — Secure)
// Sending notifications goes through Edge Function.
// Admin check happens server-side, not by email.
// ============================================

async function loadNotifications() {
  const list = document.getElementById('notifications-list');
  list.innerHTML = '<div class="loading-text">Loading...</div>';

  if (!currentUser) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">◉</div>Sign in to see notifications</div>';
    return;
  }

  const { data, error } = await db.from('notifications')
    .select('*')
    .or('user_id.is.null,user_id.eq.' + currentUser.id)
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">◉</div>No notifications yet</div>';
    return;
  }

  list.innerHTML = data.map(n => {
    const isPersonal = n.user_id !== null;
    return '<div class="notif-card' + (isPersonal ? ' notif-personal' : '') + '">' +
      (isPersonal ? '<div class="notif-personal-badge">Personal</div>' : '') +
      '<div class="notif-title">' + escHtml(n.title) + '</div>' +
      '<div class="notif-msg">' + escHtml(n.message) + '</div>' +
      '<div class="notif-date">' + new Date(n.created_at).toLocaleDateString('en-IN', {
        day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'
      }) + '</div>' +
    '</div>';
  }).join('');

  document.getElementById('notif-badge').style.display = 'none';
}

async function loadNotificationCount() {
  if (!currentUser) return;
  const { count } = await db.from('notifications')
    .select('id', { count: 'exact', head: true })
    .or('user_id.is.null,user_id.eq.' + currentUser.id);

  const seen = parseInt(localStorage.getItem('sa_notif_seen') || '0');
  const unread = (count || 0) - seen;
  const badge = document.getElementById('notif-badge');
  if (unread > 0) {
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

// ── Send notification via Edge Function (admin-only) ─────────────────
document.getElementById('send-notif-btn').addEventListener('click', async () => {
  const title = document.getElementById('notif-title').value.trim();
  const message = document.getElementById('notif-message').value.trim();
  if (!title || !message) return showToast('Fill in title and message');

  const btn = document.getElementById('send-notif-btn');
  btn.textContent = 'Sending...'; btn.disabled = true;

  try {
    const { data: { session } } = await db.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const EDGE_BASE = window.SUPABASE_URL || 'https://biqdrsqirzxnznyucwtz.supabase.co';
    const res = await fetch(`${EDGE_BASE}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({ title, message, user_id: null }), // null = broadcast
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to send');

    document.getElementById('notif-title').value = '';
    document.getElementById('notif-message').value = '';
    showToast('✅ Notification sent to all users!');
    loadNotifications();
  } catch (err) {
    showToast('❌ ' + err.message);
  } finally {
    btn.textContent = 'Send Notification';
    btn.disabled = false;
  }
});

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}