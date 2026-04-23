// ============================================
// STUDY AURA — NOTIFICATIONS
// ============================================

async function loadNotifications() {
  const list = document.getElementById('notifications-list');
  list.innerHTML = '<div class="loading-text">Loading...</div>';

  const { data, error } = await db.from('notifications')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">◉</div>No notifications yet</div>';
    return;
  }

  list.innerHTML = data.map(n => `
    <div class="notif-card">
      <div class="notif-title">${escHtml(n.title)}</div>
      <div class="notif-msg">${escHtml(n.message)}</div>
      <div class="notif-date">${new Date(n.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
    </div>
  `).join('');

  // Update badge
  const badge = document.getElementById('notif-badge');
  badge.style.display = 'none';
}

async function loadNotificationCount() {
  const { count } = await db.from('notifications')
    .select('id', { count: 'exact', head: true });

  // Simple unread tracking via localStorage
  const seen = parseInt(localStorage.getItem('sa_notif_seen') || '0');
  const unread = (count || 0) - seen;
  const badge = document.getElementById('notif-badge');
  if (unread > 0) {
    badge.textContent = unread;
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

document.getElementById('send-notif-btn').addEventListener('click', async () => {
  const title = document.getElementById('notif-title').value.trim();
  const message = document.getElementById('notif-message').value.trim();
  if (!title || !message) return showToast('Fill in title and message');

  const btn = document.getElementById('send-notif-btn');
  btn.textContent = 'Sending...'; btn.disabled = true;

  const { error } = await db.from('notifications').insert({ title, message });

  btn.textContent = 'Send Notification'; btn.disabled = false;
  if (error) return showToast('Error: ' + error.message);

  document.getElementById('notif-title').value = '';
  document.getElementById('notif-message').value = '';
  showToast('✅ Notification sent!');
  loadNotifications();
});