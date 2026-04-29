/* ═══════════════════════════════════════════════════════
   ZEROday — JEE Solver  (solver.js  v2)
   Plain script — no ES modules.
   Depends on:  db, currentUser  (from config.js)
   Renders into solver.html (v2 — Kinetic Zero design)
   ═══════════════════════════════════════════════════════ */

// ── Local stats ─────────────────────────────────────────
var _solverStats = null;

function _statsKey() {
  return (
    "zd_solver_" +
    (currentUser && currentUser.id ? currentUser.id.slice(0, 8) : "guest")
  );
}
function loadSolverStats() {
  try {
    _solverStats = JSON.parse(localStorage.getItem(_statsKey()) || "null");
  } catch (e) {}
  if (!_solverStats)
    _solverStats = { score: 0, streak: 0, total: 0, correct: 0, wrong: 0 };
  updateScorePill();
}
function saveSolverStats() {
  localStorage.setItem(_statsKey(), JSON.stringify(_solverStats));
  updateScorePill();
}
function updateScorePill() {
  var el = document.getElementById("solver-score-val");
  if (el && _solverStats) el.textContent = _solverStats.score;
}

// ── Question state ───────────────────────────────────────
var qState = {
  mode: "pyq",
  subject: "physics",
  chapter: null,
  questions: [],
  index: 0,
  answered: false,
  statuses: [],
};

var bNav = { id: null, folder: null, subjectKey: null, chapter: null };
var _cache = {};
var _currentMode = "pyq";

// ═══════════════════════════════════════════════════════
//  Init
// ═══════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", function () {
  setTimeout(function () {
    loadSolverStats();
    buildChapterList("physics");
  }, 400);

  document.getElementById("btn-next").addEventListener("click", function () {
    if (qState.index < qState.questions.length - 1) {
      qState.index++;
    } else {
      qState.index = 0;
    }
    qState.answered = false;
    loadQuestion();
    updateQNav();
  });

  document.getElementById("btn-skip").addEventListener("click", function () {
    if (qState.statuses[qState.index] === "unseen")
      qState.statuses[qState.index] = "skipped";
    updateQNav();
    if (qState.index < qState.questions.length - 1) {
      qState.index++;
    } else {
      qState.index = 0;
    }
    qState.answered = false;
    loadQuestion();
    updateQNav();
  });

  document
    .getElementById("btn-check-int")
    .addEventListener("click", function () {
      if (qState.answered || qState.mode !== "pyq") return;
      var val = document.getElementById("integer-input").value.trim();
      if (!val) return;
      qState.answered = true;
      var q = qState.questions[qState.index];
      var isCorrect = Number(val) === Number(q.answer);
      document
        .getElementById("integer-input")
        .classList.add(isCorrect ? "correct" : "wrong");
      var fb = document.getElementById("integer-feedback");
      fb.className = "zd-integer-feedback " + (isCorrect ? "correct" : "wrong");
      fb.textContent = isCorrect
        ? "✓ Correct!"
        : "✗ Wrong. Answer: " + q.answer;
      finalize(isCorrect, q);
    });
});

// ═══════════════════════════════════════════════════════
//  Mode switching
// ═══════════════════════════════════════════════════════
function switchMode(mode) {
  _currentMode = mode;
  document.getElementById("tab-pyq").classList.toggle("active", mode === "pyq");
  document
    .getElementById("tab-booklet")
    .classList.toggle("active", mode === "booklet");
  document
    .getElementById("mode-pyq")
    .classList.toggle("hidden", mode !== "pyq");
  document
    .getElementById("mode-booklet")
    .classList.toggle("hidden", mode !== "booklet");
  if (mode === "booklet") showBookletLanding();
}

// ═══════════════════════════════════════════════════════
//  PYQ — subject + chapter selection
// ═══════════════════════════════════════════════════════
function selectSubject(btn) {
  document.querySelectorAll(".zd-subject-btn").forEach(function (b) {
    b.classList.remove("active");
  });
  btn.classList.add("active");
  qState.subject = btn.dataset.subject;
  buildChapterList(btn.dataset.subject);
  document.getElementById("empty-state-q").classList.remove("hidden");
  document.getElementById("q-content").classList.add("hidden");
  document.getElementById("q-nav-grid").innerHTML = "";
  document.getElementById("qnav-title").textContent = "QUESTIONS";
}

async function buildChapterList(subject) {
  var el = document.getElementById("pyq-chapter-list");
  el.innerHTML = '<div class="zd-loading">Loading…</div>';

  var cacheKey = "chapters_" + subject;
  var chapters = _cache[cacheKey];

  if (!chapters) {
    var result = await db
      .from("questions")
      .select("chapter")
      .eq("subject", subject)
      .eq("exam_type", "pyq");

    if (result.error || !result.data) {
      el.innerHTML =
        '<div style="color:#849495;font-size:0.8rem;padding:0.5rem">No chapters found</div>';
      return;
    }
    chapters = Array.from(
      new Set(
        result.data.map(function (r) {
          return r.chapter;
        }),
      ),
    ).sort();
    _cache[cacheKey] = chapters;
  }

  if (!chapters.length) {
    el.innerHTML =
      '<div style="color:#849495;font-size:0.8rem;padding:0.5rem">No chapters found</div>';
    return;
  }

  el.innerHTML = chapters
    .map(function (ch) {
      return (
        '<button class="zd-chapter-btn" onclick="selectChapter(this)" data-chapter="' +
        _esc(ch) +
        '">' +
        _esc(ch) +
        "</button>"
      );
    })
    .join("");
}

async function selectChapter(btn) {
  var ch = btn.dataset.chapter;
  var subject = qState.subject;
  var cacheKey = subject + "/" + ch;

  document.querySelectorAll(".zd-chapter-btn").forEach(function (b) {
    b.classList.remove("active");
  });
  btn.classList.add("active");

  document.getElementById("empty-state-q").classList.add("hidden");
  document.getElementById("q-content").classList.add("hidden");
  document.getElementById("q-nav-grid").innerHTML =
    '<span style="color:#849495;font-size:0.72rem;font-family:Space Grotesk,sans-serif;letter-spacing:0.08em">LOADING…</span>';

  if (!_cache[cacheKey]) {
    var result = await db
      .from("questions")
      .select("*")
      .eq("subject", subject)
      .eq("chapter", ch)
      .eq("exam_type", "pyq")
      .order("year", { ascending: false });

    if (result.error || !result.data) {
      document.getElementById("empty-state-q").classList.remove("hidden");
      document.getElementById("empty-state-q").innerHTML =
        "<h3>FAILED TO LOAD</h3><p>" +
        (result.error ? result.error.message : "No questions found") +
        "</p>";
      document.getElementById("q-nav-grid").innerHTML = "";
      return;
    }
    _cache[cacheKey] = normalise(result.data);
  }

  qState.mode = "pyq";
  qState.chapter = ch;
  qState.subject = subject;
  qState.questions = _cache[cacheKey];
  qState.index = 0;
  qState.answered = false;
  qState.statuses = qState.questions.map(function () {
    return "unseen";
  });

  document.getElementById("qnav-title").textContent =
    ch.toUpperCase() + " (" + qState.questions.length + ")";
  buildQNav();
  document.getElementById("empty-state-q").classList.add("hidden");
  document.getElementById("q-content").classList.remove("hidden");
  loadQuestion();
}

// ═══════════════════════════════════════════════════════
//  Q Navigator
// ═══════════════════════════════════════════════════════
function getQNavGrid() {
  if (qState.mode === "booklet") {
    var bc = document.getElementById("booklet-content");
    return bc ? bc.querySelector("#q-nav-grid") : null;
  }
  return document.getElementById("q-nav-grid");
}

function buildQNav() {
  var grid = getQNavGrid();
  if (!grid) return;
  grid.innerHTML = qState.questions
    .map(function (q, i) {
      return (
        '<button class="solver-q-box ' +
        qState.statuses[i] +
        (i === qState.index ? " current" : "") +
        '" data-idx="' +
        i +
        '" onclick="jumpToQ(' +
        i +
        ')">' +
        (i + 1) +
        "</button>"
      );
    })
    .join("");
}

function updateQNav() {
  var grid = getQNavGrid();
  if (!grid) return;
  grid.querySelectorAll(".solver-q-box").forEach(function (box, i) {
    box.className =
      "solver-q-box " +
      qState.statuses[i] +
      (i === qState.index ? " current" : "");
  });
}

function jumpToQ(idx) {
  qState.index = idx;
  qState.answered = false;
  loadQuestion();
  updateQNav();
}

// ═══════════════════════════════════════════════════════
//  Question rendering
// ═══════════════════════════════════════════════════════
function getCtx() {
  if (qState.mode === "booklet") {
    var bc = document.getElementById("booklet-content");
    return function (id) {
      return bc ? bc.querySelector("#" + id) : null;
    };
  }
  return function (id) {
    return document.getElementById(id);
  };
}

function loadQuestion() {
  var q = qState.questions[qState.index];
  if (!q) return;

  var $ = getCtx();
  qState.answered = false;
  $("btn-next").disabled = true;
  $("integer-feedback").textContent = "";
  $("integer-input").value = "";
  $("integer-input").className = "zd-integer-input";
  $("explanation-box").classList.remove("show");
  $("q-card").classList.remove("solver-pop");

  var diff = q.difficulty || "";
  var typeLabel = q.type === "integer" ? "Numerical" : "MCQ";
  $("q-meta").innerHTML =
    '<span class="solver-badge solver-badge-chapter">' +
    _esc(q.chapter) +
    "</span>" +
    '<span class="solver-badge solver-badge-' +
    diff +
    '">' +
    diff +
    "</span>" +
    '<span class="solver-badge solver-badge-' +
    (q.type === "integer" ? "integer" : "mcq") +
    '">' +
    typeLabel +
    "</span>" +
    (q.year
      ? '<span class="solver-badge solver-badge-year">' +
        q.year +
        (q.shift ? " · " + q.shift : "") +
        "</span>"
      : "");

  $("q-text").innerHTML = q.text || "";
  renderMath($("q-text"));

  var imgEl = $("q-image");
  if (q.image) {
    imgEl.src = q.image;
    imgEl.classList.remove("hidden");
    imgEl.onerror = function () {
      imgEl.classList.add("hidden");
    };
  } else {
    imgEl.classList.add("hidden");
  }

  if (q.type === "integer") {
    $("options-grid").classList.add("hidden");
    $("integer-wrap").classList.remove("hidden");
  } else {
    $("integer-wrap").classList.add("hidden");
    $("options-grid").classList.remove("hidden");
    renderOptions(q, $);
  }

  $("q-progress").textContent =
    qState.index + 1 + " / " + qState.questions.length;
  renderMath($("q-card"));
}

function renderOptions(q, $) {
  var keys = ["A", "B", "C", "D", "E"];
  $("options-grid").innerHTML = (q.options || [])
    .map(function (opt, i) {
      var imgHtml = opt.image
        ? '<img src="' +
          _esc(opt.image) +
          '" style="max-width:100%;margin-top:0.4rem;border-radius:6px"/>'
        : "";
      var optText = opt.text || "";
      return (
        '<button class="solver-option-btn" onclick="handleMCQ(' +
        i +
        ')" data-idx="' +
        i +
        '">' +
        '<span class="solver-option-key">' +
        keys[i] +
        "</span>" +
        '<span class="opt-text-' +
        i +
        '">' +
        optText +
        imgHtml +
        "</span>" +
        "</button>"
      );
    })
    .join("");
  renderMath($("options-grid"));
}

function handleMCQ(selected) {
  if (qState.answered) return;
  qState.answered = true;
  var q = qState.questions[qState.index];
  var isCorrect = selected === q.correct;
  var $ = getCtx();

  $("options-grid")
    .querySelectorAll(".solver-option-btn")
    .forEach(function (btn, i) {
      btn.classList.add("disabled");
      if (i === q.correct) btn.classList.add("correct");
      if (i === selected && selected !== q.correct) btn.classList.add("wrong");
    });
  finalize(isCorrect, q);
}

function finalize(isCorrect, q) {
  qState.statuses[qState.index] = isCorrect ? "correct" : "wrong";
  updateQNav();

  var $ = getCtx();

  _solverStats.total++;
  if (isCorrect) {
    _solverStats.correct++;
    _solverStats.streak++;
    _solverStats.score += 4;
    $("q-card").classList.add("solver-pop");
    setTimeout(function () {
      $("q-card").classList.remove("solver-pop");
    }, 380);
  } else {
    _solverStats.wrong++;
    _solverStats.streak = 0;
    _solverStats.score = Math.max(0, _solverStats.score - 1);
  }
  saveSolverStats();

  if (currentUser && q._dbId) {
    db.from("user_attempts")
      .insert({
        user_id: currentUser.id,
        question_id: q._dbId,
        is_correct: isCorrect,
        selected_answer: String(
          isCorrect
            ? q.correct !== undefined
              ? q.correct
              : q.answer
            : "wrong",
        ),
      })
      .then(function () {})
      .catch(function () {});
  }

  if (q.explanation) {
    $("explanation-text").innerHTML = _formatText(q.explanation);
    if (q.explanation_image_url) {
      $("explanation-text").innerHTML +=
        '<img src="' +
        _esc(q.explanation_image_url) +
        '" style="max-width:100%;border-radius:8px;margin-top:0.8rem" onerror="this.style.display=\'none\'"/>';
    }
    $("explanation-box").classList.add("show");
    renderMath($("explanation-box"));
  }
  $("btn-next").disabled = false;

  if (qState.mode === "booklet") updateBookletStats();
}

// ═══════════════════════════════════════════════════════
//  Booklet system
// ═══════════════════════════════════════════════════════
async function showBookletLanding() {
  var wrap = document.getElementById("booklet-content");
  wrap.innerHTML = '<div class="zd-loading">Loading booklets…</div>';

  var booklets;
  try {
    var res = await fetch("Booklets/manifest.json");
    booklets = res.ok ? await res.json() : [];
  } catch (e) {
    booklets = [];
  }

  if (!booklets || !booklets.length) {
    wrap.innerHTML =
      '<div style="color:#849495;padding:2rem;text-align:center;font-family:Space Grotesk,sans-serif;letter-spacing:0.08em;font-size:0.8rem">NO BOOKLETS FOUND</div>';
    return;
  }

  wrap.innerHTML =
    '<div class="booklet-landing-wrap">' +
    '<div class="booklet-landing-hdr"><h2>📒 BOOKLETS</h2><p>Curated question sets for deep conceptual mastery</p></div>' +
    '<div class="booklet-cards-grid">' +
    booklets
      .map(function (b) {
        return (
          '<div class="booklet-card" onclick="showBookletSubjects(' +
          JSON.stringify(b.id) +
          "," +
          JSON.stringify(b.folder) +
          ')">' +
          '<div class="booklet-card-icon">' +
          (b.icon || "📒") +
          "</div>" +
          '<div class="booklet-card-title">' +
          _esc(b.title) +
          "</div>" +
          '<div class="booklet-card-desc">' +
          _esc(b.description || "") +
          "</div>" +
          '<div class="booklet-card-tags">' +
          (b.tags || [])
            .map(function (t) {
              return '<span class="booklet-tag">' + _esc(t) + "</span>";
            })
            .join("") +
          '<span class="booklet-tag live">Live</span>' +
          "</div>" +
          "</div>"
        );
      })
      .join("") +
    "</div>" +
    "</div>";
}

async function showBookletSubjects(bookletId, bookletFolder) {
  bNav.id = bookletId;
  bNav.folder = bookletFolder;
  var wrap = document.getElementById("booklet-content");
  wrap.innerHTML = '<div class="zd-loading">Loading subjects…</div>';

  var meta;
  try {
    var res = await fetch("Booklets/" + bookletFolder + "/manifest.json");
    meta = res.ok ? await res.json() : null;
  } catch (e) {
    meta = null;
  }

  if (!meta || !meta.subjects) {
    wrap.innerHTML =
      '<p style="color:#e74c3c;padding:1rem">Could not load booklet manifest.</p>';
    return;
  }

  var subjectCards = Object.entries(meta.subjects)
    .map(function (entry) {
      var key = entry[0];
      var sub = entry[1];
      var clickAttr = sub.comingSoon
        ? ""
        : 'onclick="showBookletChapters(' +
          JSON.stringify(bookletId) +
          "," +
          JSON.stringify(bookletFolder) +
          "," +
          JSON.stringify(key) +
          "," +
          JSON.stringify(sub.label || key) +
          ')"';
      return (
        '<div class="booklet-subject-card" ' +
        clickAttr +
        (sub.comingSoon ? ' style="opacity:0.55;cursor:default"' : "") +
        ">" +
        '<div class="bsc-icon">' +
        (sub.icon || "📂") +
        "</div>" +
        '<div class="bsc-name">' +
        _esc(sub.label || key) +
        "</div>" +
        '<div class="bsc-desc">' +
        _esc(sub.desc || "") +
        "</div>" +
        '<span class="bsc-badge ' +
        (sub.comingSoon ? "soon" : "live") +
        '">' +
        (sub.comingSoon ? "Coming Soon" : "Live") +
        "</span>" +
        "</div>"
      );
    })
    .join("");

  wrap.innerHTML =
    '<button class="solver-back-btn" onclick="showBookletLanding()">← ALL BOOKLETS</button>' +
    '<h3 style="font-family:Space Grotesk,sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:0.04em;color:#dbfcff;margin-bottom:0.5rem">' +
    _esc(meta.title || bookletFolder) +
    "</h3>" +
    '<div class="booklet-subject-grid">' +
    subjectCards +
    "</div>";
}

async function showBookletChapters(
  bookletId,
  bookletFolder,
  subjectKey,
  subjectLabel,
) {
  bNav.subjectKey = subjectKey;
  var wrap = document.getElementById("booklet-content");
  wrap.innerHTML = '<div class="zd-loading">Loading chapters…</div>';

  var chapters;
  try {
    var res = await fetch(
      "Booklets/" + bookletFolder + "/" + subjectKey + "/manifest.json",
    );
    chapters = res.ok ? await res.json() : null;
  } catch (e) {
    chapters = null;
  }

  if (!chapters || !chapters.length) {
    wrap.innerHTML =
      '<p style="color:#849495;padding:1rem">No chapters found.</p>';
    return;
  }

  var cards = chapters
    .map(function (ch) {
      return (
        '<div class="booklet-chapter-card" onclick="startBookletChapter(' +
        JSON.stringify(bookletId) +
        "," +
        JSON.stringify(bookletFolder) +
        "," +
        JSON.stringify(subjectKey) +
        "," +
        JSON.stringify(ch) +
        ')">' +
        '<div class="bcc-icon">📋</div>' +
        '<div class="bcc-name">' +
        _esc(ch) +
        "</div>" +
        '<div class="bcc-desc">Click to start</div>' +
        "</div>"
      );
    })
    .join("");

  wrap.innerHTML =
    '<button class="solver-back-btn" onclick="showBookletSubjects(' +
    JSON.stringify(bookletId) +
    "," +
    JSON.stringify(bookletFolder) +
    ')">← BACK</button>' +
    '<h3 style="font-family:Space Grotesk,sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:0.04em;color:#dbfcff;margin-bottom:0.5rem">📂 ' +
    _esc(subjectLabel) +
    "</h3>" +
    '<div class="booklet-chapter-grid">' +
    cards +
    "</div>";
}

async function startBookletChapter(
  bookletId,
  bookletFolder,
  subjectKey,
  chapterName,
) {
  bNav.chapter = chapterName;
  var wrap = document.getElementById("booklet-content");
  wrap.innerHTML = '<div class="zd-loading">Loading questions…</div>';

  var cacheKey = bookletId + "/" + subjectKey + "/" + chapterName;
  if (!_cache[cacheKey]) {
    var result = await db
      .from("questions")
      .select("*")
      .eq("exam_type", "booklet")
      .eq("booklet_id", bookletId)
      .eq("chapter", chapterName);

    if (result.error || !result.data) {
      wrap.innerHTML =
        '<p style="color:#e74c3c;padding:1rem">Failed to load questions: ' +
        (result.error ? result.error.message : "No data") +
        "</p>";
      return;
    }
    _cache[cacheKey] = normalise(result.data);
  }

  var questions = _cache[cacheKey];
  qState.mode = "booklet";
  qState.subject = subjectKey.toLowerCase();
  qState.chapter = chapterName;
  qState.questions = questions;
  qState.index = 0;
  qState.answered = false;
  qState.statuses = questions.map(function () {
    return "unseen";
  });

  renderBookletSolver(
    bookletId,
    bookletFolder,
    subjectKey,
    chapterName,
    questions,
  );
}

function renderBookletSolver(
  bookletId,
  bookletFolder,
  subjectKey,
  chapterName,
  questions,
) {
  var wrap = document.getElementById("booklet-content");
  wrap.innerHTML =
    '<div class="booklet-solver-wrap">' +
    '<div class="booklet-solver-info">' +
    '<button class="solver-back-btn" onclick="showBookletChapters(' +
    JSON.stringify(bookletId) +
    "," +
    JSON.stringify(bookletFolder) +
    "," +
    JSON.stringify(subjectKey) +
    "," +
    JSON.stringify(subjectKey) +
    ')">← CHAPTERS</button>' +
    '<div class="zd-section-label" style="margin-top:0.4rem">BOOKLET</div>' +
    '<div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:0.92rem;margin-bottom:0.2rem;color:#e5e2e1">' +
    _esc(chapterName) +
    "</div>" +
    '<div style="font-size:0.74rem;color:#849495;margin-bottom:0.8rem;text-transform:uppercase;letter-spacing:0.08em">' +
    _esc(subjectKey) +
    "</div>" +
    '<div style="height:1px;background:#1f1f1f;margin:0.7rem 0"></div>' +
    '<div class="booklet-stat-row">' +
    '<div><div class="booklet-stat-val" id="bk-correct" style="color:#27ae60">0</div><div class="booklet-stat-lbl">Correct</div></div>' +
    '<div class="booklet-stat-sep">·</div>' +
    '<div><div class="booklet-stat-val" id="bk-wrong" style="color:#e74c3c">0</div><div class="booklet-stat-lbl">Wrong</div></div>' +
    '<div class="booklet-stat-sep">·</div>' +
    '<div><div class="booklet-stat-val" style="color:#00f0ff">' +
    questions.length +
    '</div><div class="booklet-stat-lbl">Total</div></div>' +
    "</div>" +
    "</div>" +
    '<div class="zd-right">' +
    '<div class="zd-card zd-qnav-card">' +
    '<div class="zd-qnav-header">' +
    '<span class="zd-qnav-title" id="qnav-title">' +
    chapterName.toUpperCase() +
    " (" +
    questions.length +
    ")</span>" +
    '<div class="zd-qnav-legend">' +
    '<span class="zd-pip" style="background:#27ae60"></span>Correct ' +
    '<span class="zd-pip" style="background:#e74c3c"></span>Wrong ' +
    '<span class="zd-pip" style="background:#f39c12"></span>Skipped ' +
    '<span class="zd-pip" style="background:#2a2a2a"></span>Unseen' +
    "</div>" +
    "</div>" +
    '<div class="zd-qnav-grid" id="q-nav-grid"></div>' +
    "</div>" +
    '<div class="zd-card zd-q-card" id="q-card">' +
    '<div id="empty-state-q" class="zd-empty-state hidden"></div>' +
    '<div id="q-content">' +
    '<div class="zd-q-meta" id="q-meta"></div>' +
    '<div class="zd-q-text" id="q-text"></div>' +
    '<img id="q-image" class="zd-q-image hidden" alt=""/>' +
    '<div class="zd-options-grid" id="options-grid"></div>' +
    '<div id="integer-wrap" class="zd-integer-box hidden">' +
    "<label>ENTER YOUR NUMERICAL ANSWER:</label>" +
    '<div class="zd-integer-row">' +
    '<input type="number" step="any" class="zd-integer-input" id="integer-input"/>' +
    '<button class="zd-btn zd-btn-check" id="btn-check-int">CHECK</button>' +
    "</div>" +
    '<div class="zd-integer-feedback" id="integer-feedback"></div>' +
    "</div>" +
    '<div class="zd-explanation" id="explanation-box">' +
    '<div class="zd-explanation-label"><span class="material-symbols-outlined" style="font-size:12px">auto_awesome</span> SOLUTION</div>' +
    '<div class="zd-explanation-text" id="explanation-text"></div>' +
    "</div>" +
    '<div class="zd-q-actions">' +
    '<button class="zd-btn zd-btn-ghost" id="btn-skip">SKIP</button>' +
    '<button class="zd-btn zd-btn-primary" id="btn-next" disabled>NEXT →</button>' +
    '<span class="zd-q-progress" id="q-progress">1 / ' +
    questions.length +
    "</span>" +
    "</div>" +
    "</div>" +
    "</div>" +
    "</div>" +
    "</div>";

  // Wire booklet buttons
  wrap.querySelector("#btn-next").addEventListener("click", function () {
    if (qState.index < qState.questions.length - 1) {
      qState.index++;
    } else {
      qState.index = 0;
    }
    qState.answered = false;
    loadQuestion();
    updateQNav();
    updateBookletStats();
  });
  wrap.querySelector("#btn-skip").addEventListener("click", function () {
    if (qState.statuses[qState.index] === "unseen")
      qState.statuses[qState.index] = "skipped";
    updateQNav();
    if (qState.index < qState.questions.length - 1) {
      qState.index++;
    } else {
      qState.index = 0;
    }
    qState.answered = false;
    loadQuestion();
    updateQNav();
    updateBookletStats();
  });
  wrap.querySelector("#btn-check-int").addEventListener("click", function () {
    if (qState.answered) return;
    var val = wrap.querySelector("#integer-input").value.trim();
    if (!val) return;
    qState.answered = true;
    var q = qState.questions[qState.index];
    var isCorrect = Number(val) === Number(q.answer);
    wrap
      .querySelector("#integer-input")
      .classList.add(isCorrect ? "correct" : "wrong");
    var fb = wrap.querySelector("#integer-feedback");
    fb.className = "zd-integer-feedback " + (isCorrect ? "correct" : "wrong");
    fb.textContent = isCorrect ? "✓ Correct!" : "✗ Wrong. Answer: " + q.answer;
    finalize(isCorrect, q);
  });

  buildQNav();
  loadQuestion();
  updateBookletStats();
}

function updateBookletStats() {
  var bc = document.getElementById("booklet-content");
  if (!bc) return;
  var cEl = bc.querySelector("#bk-correct");
  var wEl = bc.querySelector("#bk-wrong");
  if (cEl)
    cEl.textContent = qState.statuses.filter(function (s) {
      return s === "correct";
    }).length;
  if (wEl)
    wEl.textContent = qState.statuses.filter(function (s) {
      return s === "wrong";
    }).length;
}

// ═══════════════════════════════════════════════════════
//  Normalise DB rows
// ═══════════════════════════════════════════════════════
function normalise(rows) {
  return (rows || []).map(function (r) {
    return {
      _dbId: r.id,
      id: r.id,
      chapter: r.chapter,
      difficulty: r.difficulty,
      type: r.type,
      text: r.question_text,
      image: r.question_image_url || "",
      options: r.options || [],
      correct: r.type === "mcq" ? Number(r.correct_answer) : undefined,
      answer: r.type === "integer" ? Number(r.correct_answer) : undefined,
      explanation: r.explanation || "",
      explanation_image_url: r.explanation_image_url || null,
      year: r.year,
      shift: r.shift,
      subject: r.subject,
      booklet_id: r.booklet_id,
    };
  });
}

// ═══════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════
function _esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _formatText(text) {
  if (!text) return "";
  return String(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function renderMath(el) {
  if (!el || !window.renderMathInElement) return;
  setTimeout(function () {
    renderMathInElement(el, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
    });
  }, 30);
}
