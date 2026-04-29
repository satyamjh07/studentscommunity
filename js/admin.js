// ============================================
// STUDY AURA — ADMIN PANEL (v2)
// Accessible only to users with role = 'admin'
// Uses custom confirm modal, not browser confirm()
// ============================================

async function loadAdminPanel() {
  if (!currentProfile || currentProfile.role !== "admin") return;

  document.getElementById("admin-stat-users").textContent = "…";
  document.getElementById("admin-stat-posts").textContent = "…";
  document.getElementById("admin-stat-reports").textContent = "…";

  const [{ count: userCount }, { count: postCount }, { count: reportCount }] =
    await Promise.all([
      db.from("profiles").select("id", { count: "exact", head: true }),
      db.from("posts").select("id", { count: "exact", head: true }),
      db
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

  document.getElementById("admin-stat-users").textContent = userCount || 0;
  document.getElementById("admin-stat-posts").textContent = postCount || 0;
  document.getElementById("admin-stat-reports").textContent = reportCount || 0;

  loadAdminReports();
  loadAdminUsers();
  loadAdminPosts();
}

// ---- Tab switching ----
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".admin-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".admin-tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".admin-tab-pane")
        .forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document
        .getElementById("admin-tab-" + btn.dataset.tab)
        .classList.add("active");
    });
  });
});

// ---- Reports ----
async function loadAdminReports() {
  const list = document.getElementById("admin-reports-list");
  if (!list) return;
  list.innerHTML = '<div class="loading-text">Loading reports...</div>';

  const { data: reports, error } = await db
    .from("reports")
    .select(
      "*, reporter:reporter_id(name), post:post_id(id, content, user_id), comment:comment_id(id, content, user_id)",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !reports || reports.length === 0) {
    list.innerHTML =
      '<div class="empty-state" style="padding:2rem">No reports yet 🎉</div>';
    return;
  }

  list.innerHTML = reports
    .map((r) => {
      const targetContent = r.post
        ? r.post.content
        : r.comment
          ? r.comment.content
          : "Deleted content";
      const targetType = r.post ? "Post" : "Comment";
      const statusClass =
        r.status === "pending"
          ? "badge-pending"
          : r.status === "resolved"
            ? "badge-resolved"
            : "badge-dismissed";
      const snippet =
        escHtml((targetContent || "").substring(0, 120)) +
        ((targetContent || "").length > 120 ? "…" : "");
      const reporterName = escHtml(r.reporter ? r.reporter.name : "Anonymous");
      const actionsHtml =
        r.status === "pending"
          ? '<div class="admin-report-actions">' +
            (r.post
              ? '<button class="btn-danger-sm" onclick="adminDeleteReportedPost(\'' +
                r.post.id +
                "', '" +
                r.id +
                "')\">🗑️ Delete Post</button>"
              : "") +
            (r.comment
              ? '<button class="btn-danger-sm" onclick="adminDeleteReportedComment(\'' +
                r.comment.id +
                "', '" +
                r.id +
                "')\">🗑️ Delete Comment</button>"
              : "") +
            '<button class="btn-secondary-sm" onclick="adminResolveReport(\'' +
            r.id +
            "', 'resolved')\">✅ Resolve</button>" +
            '<button class="btn-secondary-sm" onclick="adminResolveReport(\'' +
            r.id +
            "', 'dismissed')\">❌ Dismiss</button>" +
            "</div>"
          : "";

      return (
        '<div class="admin-report-card" id="report-card-' +
        r.id +
        '">' +
        '<div class="admin-report-header">' +
        '<span class="report-type-badge">' +
        targetType +
        "</span>" +
        '<span class="report-status-badge ' +
        statusClass +
        '">' +
        r.status +
        "</span>" +
        '<span class="admin-report-time">' +
        timeAgo(r.created_at) +
        "</span>" +
        "</div>" +
        '<div class="admin-report-content">' +
        '<div class="admin-report-target">"' +
        snippet +
        '"</div>' +
        '<div class="admin-report-reason"><strong>Reason:</strong> ' +
        escHtml(r.reason) +
        "</div>" +
        '<div class="admin-report-reporter">Reported by: ' +
        reporterName +
        "</div>" +
        "</div>" +
        actionsHtml +
        "</div>"
      );
    })
    .join("");
}

async function adminDeleteReportedPost(postId, reportId) {
  showConfirm(
    "Delete Post",
    "Delete this post and all its comments? This cannot be undone.",
    async () => {
      const { error } = await db.from("posts").delete().eq("id", postId);
      if (error) return showToast("Error deleting post: " + error.message);
      await db
        .from("reports")
        .update({ status: "resolved", resolved_by: currentUser.id })
        .eq("id", reportId);
      showToast("✅ Post deleted & report resolved");
      loadAdminReports();
      loadAdminPosts();
      refreshAdminStats();
    },
  );
}

async function adminDeleteReportedComment(commentId, reportId) {
  showConfirm(
    "Delete Comment",
    "Delete this comment? This cannot be undone.",
    async () => {
      const { error } = await db.from("comments").delete().eq("id", commentId);
      if (error) return showToast("Error deleting comment: " + error.message);
      await db
        .from("reports")
        .update({ status: "resolved", resolved_by: currentUser.id })
        .eq("id", reportId);
      showToast("✅ Comment deleted & report resolved");
      loadAdminReports();
      refreshAdminStats();
    },
  );
}

async function adminResolveReport(reportId, status) {
  const { error } = await db
    .from("reports")
    .update({ status, resolved_by: currentUser.id })
    .eq("id", reportId);
  if (error) return showToast("Error: " + error.message);
  showToast(status === "resolved" ? "✅ Marked resolved" : "❌ Dismissed");
  loadAdminReports();
  refreshAdminStats();
}

async function refreshAdminStats() {
  const [{ count: reportCount }, { count: postCount }] = await Promise.all([
    db
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    db.from("posts").select("id", { count: "exact", head: true }),
  ]);
  const re = document.getElementById("admin-stat-reports");
  const pe = document.getElementById("admin-stat-posts");
  if (re) re.textContent = reportCount || 0;
  if (pe) pe.textContent = postCount || 0;
}

// ---- Users management ----
async function loadAdminUsers() {
  const list = document.getElementById("admin-users-list");
  if (!list) return;
  list.innerHTML = '<div class="loading-text">Loading users...</div>';

  const { data: users, error } = await db
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !users) {
    list.innerHTML = '<div class="empty-state">Failed to load users</div>';
    return;
  }

  const rows = users
    .map((u) => {
      const av = u.avatar_url
        ? '<img src="' + escHtml(u.avatar_url) + '" alt="">'
        : "👤";
      const muteLabel =
        u.muted_until && new Date(u.muted_until) > new Date()
          ? '<span class="mute-active-badge">Muted until ' +
            new Date(u.muted_until).toLocaleTimeString() +
            "</span>"
          : "";
      const isSelf = u.id === currentUser.id;
      const role = u.role || "member";
      return (
        '<tr id="user-row-' +
        u.id +
        '">' +
        '<td><div class="admin-user-cell">' +
        '<div class="admin-user-avatar">' +
        av +
        "</div>" +
        '<div><div class="admin-user-name">' +
        escHtml(u.name || "No name") +
        "</div>" +
        '<div class="admin-user-email">' +
        escHtml(u.email || "") +
        "</div></div>" +
        "</div></td>" +
        "<td>" +
        escHtml(u.class || "—") +
        "</td>" +
        '<td><span class="role-badge ' +
        (role === "admin"
          ? "badge-admin"
          : role === "mod"
            ? "badge-mod"
            : "badge-member") +
        '">' +
        role +
        "</span></td>" +
        "<td>" +
        new Date(u.created_at).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }) +
        "</td>" +
        '<td style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">' +
        '<select class="role-select" onchange="changeUserRole(\'' +
        u.id +
        "', this.value)\" " +
        (isSelf ? 'disabled title="Cannot change your own role"' : "") +
        ">" +
        '<option value="member"' +
        (role === "member" ? " selected" : "") +
        ">Member</option>" +
        '<option value="mod"' +
        (role === "mod" ? " selected" : "") +
        ">Mod</option>" +
        '<option value="admin"' +
        (role === "admin" ? " selected" : "") +
        ">Admin</option>" +
        "</select>" +
        muteLabel +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  list.innerHTML =
    '<table class="admin-table">' +
    "<thead><tr><th>User</th><th>Class</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead>" +
    "<tbody>" +
    rows +
    "</tbody></table>";
}

async function changeUserRole(userId, newRole) {
  showConfirm(
    "Change Role",
    "Change this user's role to " + newRole + "?",
    async () => {
      const { error } = await db
        .from("profiles")
        .update({ role: newRole })
        .eq("id", userId);
      if (error) {
        showToast("Error: " + error.message);
        loadAdminUsers();
        return;
      }

      // Notify the user about their role change
      const roleMessages = {
        mod: "You have been promoted to Moderator! You can now delete posts/comments and mute users.",
        admin: "You have been granted Admin access to Study Aura.",
        member: "Your role has been updated to Member.",
      };
      await db.from("notifications").insert({
        title: "🛡️ Role Updated",
        message:
          roleMessages[newRole] ||
          "Your role has been updated to " + newRole + ".",
        user_id: userId,
      });

      showToast("✅ Role updated to " + newRole);
      loadAdminUsers();
    },
  );
}

// ---- Posts management ----
async function loadAdminPosts() {
  const list = document.getElementById("admin-posts-list");
  if (!list) return;
  list.innerHTML = '<div class="loading-text">Loading posts...</div>';

  const { data: posts, error } = await db
    .from("posts")
    .select("*, profiles(name, role)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !posts || posts.length === 0) {
    list.innerHTML =
      '<div class="empty-state" style="padding:2rem">No posts yet</div>';
    return;
  }

  list.innerHTML = posts
    .map((p) => {
      const authorName = p.profiles ? p.profiles.name : "Unknown";
      const authorRole = p.profiles ? p.profiles.role : "";
      const snippet =
        escHtml(p.content.substring(0, 200)) +
        (p.content.length > 200 ? "…" : "");
      return (
        '<div class="admin-post-row">' +
        '<div class="admin-post-info">' +
        '<span class="admin-post-author">' +
        escHtml(authorName) +
        roleBadge(authorRole) +
        "</span>" +
        '<span class="admin-post-time">' +
        timeAgo(p.created_at) +
        "</span>" +
        "</div>" +
        '<div class="admin-post-content">' +
        snippet +
        "</div>" +
        '<button class="btn-danger-sm" onclick="adminDirectDeletePost(\'' +
        p.id +
        "')\">🗑️ Delete Post</button>" +
        "</div>"
      );
    })
    .join("");
}

async function adminDirectDeletePost(postId) {
  showConfirm(
    "Delete Post",
    "Delete this post and all its comments? This cannot be undone.",
    async () => {
      const { error } = await db.from("posts").delete().eq("id", postId);
      if (error) return showToast("Error deleting post: " + error.message);
      showToast("✅ Post deleted");
      loadAdminPosts();
      refreshAdminStats();
    },
  );
}

// ════════════════════════════════════════════════════════
// QUESTION UPLOAD — integrated from adminService.js
// Uses global: db, currentUser, uploadImageToCloudinary
// ════════════════════════════════════════════════════════
// Auto-wraps bare LaTeX in $$ if not already wrapped
// e.g.  \frac{1}{n}  →  $$\frac{1}{n}$$
// e.g.  $$\frac{1}{n}$$  →  $$\frac{1}{n}$$  (unchanged)
// e.g.  "Normal text"  →  "Normal text"  (unchanged)
function _wrapLatex(text) {
  if (!text) return text;
  var trimmed = text.trim();

  // Already wrapped in $$ ... $$ — leave as-is
  if (trimmed.startsWith("$$") && trimmed.endsWith("$$")) return trimmed;

  // Already wrapped in $ ... $ — leave as-is
  if (trimmed.startsWith("$") && trimmed.endsWith("$")) return trimmed;

  // Contains LaTeX commands — auto-wrap in $$
  var latexPattern =
    /\\[a-zA-Z]+|\\{|\\}|\^|_\{|\\frac|\\sqrt|\\begin|\\end|\\text/;
  if (latexPattern.test(trimmed)) {
    return "$$" + trimmed + "$$";
  }

  // Plain text — return as-is
  return trimmed;
}
document.addEventListener("DOMContentLoaded", function () {
  // ── MCQ / Integer toggle ──────────────────────────────
  var qTypeEl = document.getElementById("q-type");
  if (qTypeEl) {
    qTypeEl.addEventListener("change", function () {
      var isMCQ = qTypeEl.value === "mcq";
      document.getElementById("q-mcq-block").style.display = isMCQ
        ? "block"
        : "none";
      document.getElementById("q-integer-block").style.display = isMCQ
        ? "none"
        : "block";
    });
  }

  // ── Submit button ─────────────────────────────────────
  var qSubmitBtn = document.getElementById("q-submit-btn");
  if (qSubmitBtn) {
    qSubmitBtn.addEventListener("click", _submitQuestion);
  }
});

async function _uploadQuestionImage(inputId, folder) {
  var fileInput = document.getElementById(inputId);
  if (!fileInput || !fileInput.files[0]) return null;
  try {
    return await uploadImageToCloudinary(fileInput.files[0], {
      maxSizeMB: 2,
      folder: folder,
    });
  } catch (err) {
    showToast("Image upload failed: " + err.message);
    return null;
  }
}

async function _submitQuestion() {
  var statusEl = document.getElementById("q-status-msg");
  var btn = document.getElementById("q-submit-btn");

  // ── Read fields ───────────────────────────────────────
  var subject = document.getElementById("q-subject").value;
  var chapter = document.getElementById("q-chapter").value.trim();
  var examType = document.getElementById("q-exam-type").value;
  var qType = document.getElementById("q-type").value;
  var qText = document.getElementById("q-text").value.trim();

  // ── Validate ──────────────────────────────────────────
  if (!subject) {
    statusEl.style.color = "var(--red)";
    statusEl.textContent = "❌ Please select a subject.";
    return;
  }
  if (!chapter) {
    statusEl.style.color = "var(--red)";
    statusEl.textContent = "❌ Chapter is required.";
    return;
  }
  if (!qText) {
    statusEl.style.color = "var(--red)";
    statusEl.textContent = "❌ Question text is required.";
    return;
  }
  if (qType === "integer") {
    var intVal = document.getElementById("q-correct-integer").value.trim();
    if (!intVal) {
      statusEl.style.color = "var(--red)";
      statusEl.textContent = "❌ Correct answer is required for integer type.";
      return;
    }
  }

  btn.disabled = true;
  btn.textContent = "Uploading images…";
  statusEl.textContent = "";

  // ── Upload images (parallel) ──────────────────────────
  var folder = "questions/" + subject + "/" + chapter;
  var results = await Promise.all([
    _uploadQuestionImage("q-image-file", folder),
    _uploadQuestionImage("q-explanation-file", folder + "/explanations"),
  ]);
  var question_image_url = results[0];
  var explanation_image_url = results[1];

  btn.textContent = "Saving to database…";

  // ── Build options / answer ────────────────────────────
  var correct_answer,
    options = null;
  if (qType === "mcq") {
    options = [0, 1, 2, 3].map(function (i) {
      var raw = document.getElementById("q-opt" + i).value.trim();
      return { text: _wrapLatex(raw) };
    });
    correct_answer = document.getElementById("q-correct-mcq").value;
  } else {
    correct_answer = document.getElementById("q-correct-integer").value.trim();
  }

  // ── Build row ─────────────────────────────────────────
  var bookletId = document.getElementById("q-booklet-id").value.trim() || null;
  var row = {
    subject: subject,
    chapter: chapter,
    topic: document.getElementById("q-topic").value.trim() || chapter,
    exam_type: examType,
    year: document.getElementById("q-year").value || null,
    shift: document.getElementById("q-shift").value.trim() || null,
    difficulty: document.getElementById("q-difficulty").value,
    type: qType,
    question_text: _wrapLatex(qText),
    question_image_url: question_image_url,
    options: options,
    correct_answer: String(correct_answer),
    explanation: document.getElementById("q-explanation").value.trim() || null,
    explanation_image_url: explanation_image_url,
    booklet_id: bookletId,
    tags: [],
    created_by: currentUser ? currentUser.id : null,
  };

  // ── Insert into Supabase ──────────────────────────────
  var result = await db.from("questions").insert(row);

  btn.disabled = false;
  btn.textContent = "Upload Question";

  if (result.error) {
    statusEl.style.color = "var(--red)";
    statusEl.textContent = "❌ Error: " + result.error.message;
    return;
  }

  statusEl.style.color = "var(--green)";
  statusEl.textContent = "✅ Question uploaded successfully!";

  // ── Reset form ────────────────────────────────────────
  var resetIds = [
    "q-chapter",
    "q-topic",
    "q-year",
    "q-shift",
    "q-booklet-id",
    "q-text",
    "q-explanation",
    "q-opt0",
    "q-opt1",
    "q-opt2",
    "q-opt3",
    "q-correct-integer",
  ];
  resetIds.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("q-subject").value = "";
  document.getElementById("q-exam-type").value = "pyq";
  document.getElementById("q-difficulty").value = "easy";
  document.getElementById("q-type").value = "mcq";
  document.getElementById("q-mcq-block").style.display = "block";
  document.getElementById("q-integer-block").style.display = "none";

  // Clear file inputs
  ["q-image-file", "q-explanation-file"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = "";
  });

  // Auto-clear success message after 5s
  setTimeout(function () {
    if (statusEl.textContent.includes("✅")) statusEl.textContent = "";
  }, 5000);
}
function _previewQuestion() {
  var raw     = document.getElementById('q-text').value.trim();
  var preview = document.getElementById('q-text-preview');
  if (!raw) { preview.style.display = 'none'; return; }

  preview.style.display = 'block';
  preview.innerHTML = _wrapLatex(raw);

  // Render KaTeX if available (KaTeX is already loaded in index.html via solver.html,
  // but if not, the raw $$ text will show — still useful)
  if (window.renderMathInElement) {
    renderMathInElement(preview, {
      delimiters: [
        { left: '$$', right: '$$', display: true  },
        { left: '$',  right: '$',  display: false },
      ],
      throwOnError: false,
    });
  }
}