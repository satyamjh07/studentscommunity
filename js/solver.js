/* ═══════════════════════════════════════════════════════
   ZEROday — JEE Solver  (solver.js)
   Plain script — no ES modules.
   Depends on:  db, currentUser  (from config.js)
   Renders into solver.html
   ═══════════════════════════════════════════════════════ */

// ── Local stats (localStorage, keyed per user so 55 users don't collide) ──
var _solverStats = null;

function _statsKey() {
  return 'zd_solver_' + ((currentUser && currentUser.id) ? currentUser.id.slice(0,8) : 'guest');
}

function loadSolverStats() {
  try { _solverStats = JSON.parse(localStorage.getItem(_statsKey()) || 'null'); } catch(e) {}
  if (!_solverStats) {
    _solverStats = { score: 0, streak: 0, total: 0, correct: 0, wrong: 0 };
  }
  updateScorePill();
}

function saveSolverStats() {
  localStorage.setItem(_statsKey(), JSON.stringify(_solverStats));
  updateScorePill();
}

function updateScorePill() {
  var el = document.getElementById('solver-score-val');
  if (el && _solverStats) el.textContent = _solverStats.score;
}

// ── Question state ──────────────────────────────────────────
var qState = {
  mode:      'pyq',     // 'pyq' | 'booklet'
  subject:   'physics',
  chapter:   null,
  questions: [],
  index:     0,
  answered:  false,
  statuses:  []         // 'unseen'|'correct'|'wrong'|'skipped'
};

// ── Booklet nav state ───────────────────────────────────────
var bNav = { id: null, folder: null, subjectKey: null, chapter: null };

// ── Cache to avoid duplicate Supabase fetches ───────────────
var _cache = {};

// ── Current mode (pyq / booklet) ────────────────────────────
var _currentMode = 'pyq';

// ═══════════════════════════════════════════════════════════
//  Init
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  // Wait briefly for auth guard to set currentUser
  setTimeout(function() {
    loadSolverStats();
    buildChapterList('physics');
  }, 400);

  // Wire static PYQ buttons
  document.getElementById('btn-next').addEventListener('click', function() {
    if (qState.index < qState.questions.length - 1) { qState.index++; }
    else { qState.index = 0; }
    qState.answered = false;
    loadQuestion();
    updateQNav();
  });

  document.getElementById('btn-skip').addEventListener('click', function() {
    if (qState.statuses[qState.index] === 'unseen') qState.statuses[qState.index] = 'skipped';
    updateQNav();
    if (qState.index < qState.questions.length - 1) { qState.index++; }
    else { qState.index = 0; }
    qState.answered = false;
    loadQuestion();
    updateQNav();
  });

  document.getElementById('btn-check-int').addEventListener('click', function() {
    if (qState.answered || qState.mode !== 'pyq') return;
    var val = document.getElementById('integer-input').value.trim();
    if (!val) return;
    qState.answered = true;
    var q = qState.questions[qState.index];
    var isCorrect = Number(val) === Number(q.answer);
    document.getElementById('integer-input').classList.add(isCorrect ? 'correct' : 'wrong');
    var fb = document.getElementById('integer-feedback');
    fb.className = 'solver-integer-feedback ' + (isCorrect ? 'correct' : 'wrong');
    fb.textContent = isCorrect ? '✓ Correct!' : '✗ Wrong. Answer: ' + q.answer;
    finalize(isCorrect, q);
  });
});

// ═══════════════════════════════════════════════════════════
//  Mode switching
// ═══════════════════════════════════════════════════════════
function switchMode(mode) {
  _currentMode = mode;
  document.getElementById('tab-pyq').classList.toggle('active', mode === 'pyq');
  document.getElementById('tab-booklet').classList.toggle('active', mode === 'booklet');
  document.getElementById('mode-pyq').classList.toggle('hidden', mode !== 'pyq');
  document.getElementById('mode-booklet').classList.toggle('hidden', mode !== 'booklet');
  if (mode === 'booklet') showBookletLanding();
}

// ═══════════════════════════════════════════════════════════
//  PYQ — subject + chapter selection
// ═══════════════════════════════════════════════════════════
function selectSubject(btn) {
  document.querySelectorAll('.solver-subject-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  qState.subject = btn.dataset.subject;
  buildChapterList(btn.dataset.subject);
  // Reset right panel
  document.getElementById('empty-state-q').classList.remove('hidden');
  document.getElementById('q-content').classList.add('hidden');
  document.getElementById('q-nav-grid').innerHTML = '';
  document.getElementById('qnav-title').textContent = 'Questions';
}

async function buildChapterList(subject) {
  var el = document.getElementById('pyq-chapter-list');
  el.innerHTML = '<div class="solver-loading">Loading…</div>';

  var cacheKey = 'chapters_' + subject;
  var chapters = _cache[cacheKey];

  if (!chapters) {
    var result = await db
      .from('questions')
      .select('chapter')
      .eq('subject', subject)
      .eq('exam_type', 'pyq');

    if (result.error || !result.data) {
      el.innerHTML = '<div style="color:var(--text3);font-size:0.8rem;padding:0.5rem">No chapters found</div>';
      return;
    }
    // Deduplicate + sort
    chapters = Array.from(new Set(result.data.map(function(r) { return r.chapter; }))).sort();
    _cache[cacheKey] = chapters;
  }

  if (!chapters.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:0.8rem;padding:0.5rem">No chapters found</div>';
    return;
  }

  el.innerHTML = chapters.map(function(ch) {
    return '<button class="solver-chapter-btn" onclick="selectChapter(this)" data-chapter="' + _esc(ch) + '">' + _esc(ch) + '</button>';
  }).join('');
}

async function selectChapter(btn) {
  var ch      = btn.dataset.chapter;
  var subject = qState.subject;
  var cacheKey = subject + '/' + ch;

  document.querySelectorAll('.solver-chapter-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');

  document.getElementById('empty-state-q').classList.add('hidden');
  document.getElementById('q-content').classList.add('hidden');
  document.getElementById('q-nav-grid').innerHTML = '<span style="color:var(--text3);font-size:0.75rem">Loading…</span>';

  if (!_cache[cacheKey]) {
    var result = await db
      .from('questions')
      .select('*')
      .eq('subject', subject)
      .eq('chapter', ch)
      .eq('exam_type', 'pyq')
      .order('year', { ascending: false });

    if (result.error || !result.data) {
      document.getElementById('empty-state-q').classList.remove('hidden');
      document.getElementById('empty-state-q').innerHTML = '<h3>Failed to load</h3><p>' + (result.error ? result.error.message : 'No questions found') + '</p>';
      document.getElementById('q-nav-grid').innerHTML = '';
      return;
    }
    _cache[cacheKey] = normalise(result.data);
  }

  qState.mode      = 'pyq';
  qState.chapter   = ch;
  qState.subject   = subject;
  qState.questions = _cache[cacheKey];
  qState.index     = 0;
  qState.answered  = false;
  qState.statuses  = qState.questions.map(function() { return 'unseen'; });

  document.getElementById('qnav-title').textContent = ch + ' (' + qState.questions.length + ')';
  buildQNav();
  document.getElementById('empty-state-q').classList.add('hidden');
  document.getElementById('q-content').classList.remove('hidden');
  loadQuestion();
}

// ═══════════════════════════════════════════════════════════
//  Q Navigator
// ═══════════════════════════════════════════════════════════
function getQNavGrid() {
  if (qState.mode === 'booklet') {
    var bc = document.getElementById('booklet-content');
    return bc ? bc.querySelector('#q-nav-grid') : null;
  }
  return document.getElementById('q-nav-grid');
}

function buildQNav() {
  var grid = getQNavGrid();
  if (!grid) return;
  grid.innerHTML = qState.questions.map(function(q, i) {
    return '<button class="solver-q-box ' + qState.statuses[i] + (i === qState.index ? ' current' : '') + '" data-idx="' + i + '" onclick="jumpToQ(' + i + ')">' + (i+1) + '</button>';
  }).join('');
}

function updateQNav() {
  var grid = getQNavGrid();
  if (!grid) return;
  var boxes = grid.querySelectorAll('.solver-q-box');
  boxes.forEach(function(box, i) {
    box.className = 'solver-q-box ' + qState.statuses[i] + (i === qState.index ? ' current' : '');
  });
}

function jumpToQ(idx) {
  qState.index    = idx;
  qState.answered = false;
  loadQuestion();
  updateQNav();
}

// ═══════════════════════════════════════════════════════════
//  Question rendering
// ═══════════════════════════════════════════════════════════
function getCtx() {
  if (qState.mode === 'booklet') {
    var bc = document.getElementById('booklet-content');
    return function(id) { return bc ? bc.querySelector('#' + id) : null; };
  }
  return function(id) { return document.getElementById(id); };
}

function loadQuestion() {
  var q = qState.questions[qState.index];
  if (!q) return;

  var $ = getCtx();

  qState.answered = false;
  $('btn-next').disabled = true;
  $('integer-feedback').textContent = '';
  $('integer-input').value = '';
  $('integer-input').className = 'solver-integer-input';
  $('explanation-box').classList.remove('show');
  $('q-card').classList.remove('solver-pop');

  // Meta badges
  var diff   = q.difficulty || '';
  var typeLabel = q.type === 'integer' ? 'Numerical' : 'MCQ';
  $('q-meta').innerHTML =
    '<span class="solver-badge solver-badge-chapter">' + _esc(q.chapter) + '</span>' +
    '<span class="solver-badge solver-badge-' + diff + '">' + diff + '</span>' +
    '<span class="solver-badge solver-badge-' + (q.type === 'integer' ? 'integer' : 'mcq') + '">' + typeLabel + '</span>' +
    (q.year ? '<span class="solver-badge solver-badge-year">' + q.year + (q.shift ? ' · ' + q.shift : '') + '</span>' : '');

  $('q-text').innerHTML = _formatText(q.text);

  // Image
  var imgEl = $('q-image');
  if (q.image) {
    imgEl.src = q.image;
    imgEl.classList.remove('hidden');
    imgEl.onerror = function() { imgEl.classList.add('hidden'); };
  } else {
    imgEl.classList.add('hidden');
  }

  if (q.type === 'integer') {
    $('options-grid').classList.add('hidden');
    $('integer-wrap').classList.remove('hidden');
  } else {
    $('integer-wrap').classList.add('hidden');
    $('options-grid').classList.remove('hidden');
    renderOptions(q, $);
  }

  $('q-progress').textContent = (qState.index + 1) + ' / ' + qState.questions.length;
  renderMath($('q-card'));
}

function renderOptions(q, $) {
  var keys = ['A','B','C','D','E'];
  $('options-grid').innerHTML = (q.options || []).map(function(opt, i) {
    var imgHtml = opt.image ? '<img src="' + _esc(opt.image) + '" style="max-width:100%;margin-top:0.4rem;border-radius:6px"/>' : '';
    return '<button class="solver-option-btn" onclick="handleMCQ(' + i + ')" data-idx="' + i + '">' +
      '<span class="solver-option-key">' + keys[i] + '</span>' +
      '<span>' + _formatText(opt.text || '') + imgHtml + '</span>' +
      '</button>';
  }).join('');
}

function handleMCQ(selected) {
  if (qState.answered) return;
  qState.answered = true;
  var q = qState.questions[qState.index];
  var isCorrect = selected === q.correct;
  var $ = getCtx();

  $('options-grid').querySelectorAll('.solver-option-btn').forEach(function(btn, i) {
    btn.classList.add('disabled');
    if (i === q.correct) btn.classList.add('correct');
    if (i === selected && selected !== q.correct) btn.classList.add('wrong');
  });
  finalize(isCorrect, q);
}

function finalize(isCorrect, q) {
  qState.statuses[qState.index] = isCorrect ? 'correct' : 'wrong';
  updateQNav();

  var $ = getCtx();
  var sub = (q.subject || qState.subject || 'physics').toLowerCase();

  // Update stats
  _solverStats.total++;
  if (isCorrect) {
    _solverStats.correct++;
    _solverStats.streak++;
    _solverStats.score += 4;
    $('q-card').classList.add('solver-pop');
    setTimeout(function() { $('q-card').classList.remove('solver-pop'); }, 350);
  } else {
    _solverStats.wrong++;
    _solverStats.streak = 0;
    _solverStats.score = Math.max(0, _solverStats.score - 1);
  }
  saveSolverStats();

  // Record attempt (fire-and-forget, only if logged in and question has DB id)
  if (currentUser && q._dbId) {
    db.from('user_attempts').insert({
      user_id:         currentUser.id,
      question_id:     q._dbId,
      is_correct:      isCorrect,
      selected_answer: String(isCorrect ? (q.correct !== undefined ? q.correct : q.answer) : 'wrong'),
    }).then(function() {}).catch(function() {});
  }

  // Show explanation
  if (q.explanation) {
    $('explanation-text').innerHTML = _formatText(q.explanation);
    if (q.explanation_image_url) {
      $('explanation-text').innerHTML +=
        '<img src="' + _esc(q.explanation_image_url) + '" style="max-width:100%;border-radius:8px;margin-top:0.8rem" onerror="this.style.display=\'none\'"/>';
    }
    $('explanation-box').classList.add('show');
    renderMath($('explanation-box'));
  }
  $('btn-next').disabled = false;

  // If inside booklet, update live stats
  if (qState.mode === 'booklet') updateBookletStats();
}

// ═══════════════════════════════════════════════════════════
//  Booklet system
// ═══════════════════════════════════════════════════════════
async function showBookletLanding() {
  var wrap = document.getElementById('booklet-content');
  wrap.innerHTML = '<div class="solver-loading">Loading booklets…</div>';

  var booklets;
  try {
    var res = await fetch('Booklets/manifest.json');
    booklets = res.ok ? await res.json() : [];
  } catch(e) { booklets = []; }

  if (!booklets || !booklets.length) {
    wrap.innerHTML = '<div style="color:var(--text3);padding:2rem;text-align:center">No booklets found.</div>';
    return;
  }

  wrap.innerHTML =
    '<div class="booklet-landing-wrap">' +
      '<div class="booklet-landing-hdr"><h2>📒 Booklets</h2><p>Curated question sets for deep conceptual mastery</p></div>' +
      '<div class="booklet-cards-grid">' +
        booklets.map(function(b) {
          return '<div class="booklet-card" onclick="showBookletSubjects(' +
            JSON.stringify(b.id) + ',' + JSON.stringify(b.folder) + ')">' +
            '<div class="booklet-card-icon">' + (b.icon||'📒') + '</div>' +
            '<div class="booklet-card-title">' + _esc(b.title) + '</div>' +
            '<div class="booklet-card-desc">'  + _esc(b.description||'') + '</div>' +
            '<div class="booklet-card-tags">' +
              (b.tags||[]).map(function(t) { return '<span class="booklet-tag">' + _esc(t) + '</span>'; }).join('') +
              '<span class="booklet-tag live">Live</span>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';
}

async function showBookletSubjects(bookletId, bookletFolder) {
  bNav.id = bookletId; bNav.folder = bookletFolder;

  var wrap = document.getElementById('booklet-content');
  wrap.innerHTML = '<div class="solver-loading">Loading subjects…</div>';

  var meta;
  try {
    var res = await fetch('Booklets/' + bookletFolder + '/manifest.json');
    meta = res.ok ? await res.json() : null;
  } catch(e) { meta = null; }

  if (!meta || !meta.subjects) {
    wrap.innerHTML = '<p style="color:var(--red);padding:1rem">Could not load booklet manifest.</p>';
    return;
  }

  var subjectCards = Object.entries(meta.subjects).map(function(entry) {
    var key = entry[0]; var sub = entry[1];
    var clickAttr = sub.comingSoon
      ? ''
      : 'onclick="showBookletChapters(' + JSON.stringify(bookletId) + ',' + JSON.stringify(bookletFolder) + ',' + JSON.stringify(key) + ',' + JSON.stringify(sub.label||key) + ')"';
    return '<div class="booklet-subject-card" ' + clickAttr +
      (sub.comingSoon ? ' style="opacity:0.55;cursor:default"' : '') + '>' +
      '<div class="bsc-icon">' + (sub.icon||'📂') + '</div>' +
      '<div class="bsc-name">' + _esc(sub.label||key) + '</div>' +
      '<div class="bsc-desc">'  + _esc(sub.desc||'')   + '</div>' +
      '<span class="bsc-badge ' + (sub.comingSoon ? 'soon' : 'live') + '">' + (sub.comingSoon ? 'Coming Soon' : 'Live') + '</span>' +
      '</div>';
  }).join('');

  wrap.innerHTML =
    '<button class="solver-back-btn" onclick="showBookletLanding()">← All Booklets</button>' +
    '<h3 style="margin-bottom:0.5rem">' + _esc(meta.title||bookletFolder) + '</h3>' +
    '<div class="booklet-subject-grid">' + subjectCards + '</div>';
}

async function showBookletChapters(bookletId, bookletFolder, subjectKey, subjectLabel) {
  bNav.subjectKey = subjectKey;

  var wrap = document.getElementById('booklet-content');
  wrap.innerHTML = '<div class="solver-loading">Loading chapters…</div>';

  var chapters;
  try {
    var res = await fetch('Booklets/' + bookletFolder + '/' + subjectKey + '/manifest.json');
    chapters = res.ok ? await res.json() : null;
  } catch(e) { chapters = null; }

  if (!chapters || !chapters.length) {
    wrap.innerHTML = '<p style="color:var(--text3);padding:1rem">No chapters found.</p>';
    return;
  }

  var cards = chapters.map(function(ch) {
    return '<div class="booklet-chapter-card" onclick="startBookletChapter(' +
      JSON.stringify(bookletId) + ',' + JSON.stringify(bookletFolder) + ',' +
      JSON.stringify(subjectKey) + ',' + JSON.stringify(ch) + ')">' +
      '<div class="bcc-icon">📋</div>' +
      '<div class="bcc-name">' + _esc(ch) + '</div>' +
      '<div class="bcc-desc">Click to start</div>' +
      '</div>';
  }).join('');

  wrap.innerHTML =
    '<button class="solver-back-btn" onclick="showBookletSubjects(' + JSON.stringify(bookletId) + ',' + JSON.stringify(bookletFolder) + ')">← Back</button>' +
    '<h3 style="margin-bottom:0.5rem">📂 ' + _esc(subjectLabel) + '</h3>' +
    '<div class="booklet-chapter-grid">' + cards + '</div>';
}

async function startBookletChapter(bookletId, bookletFolder, subjectKey, chapterName) {
  bNav.chapter = chapterName;

  var wrap = document.getElementById('booklet-content');
  wrap.innerHTML = '<div class="solver-loading">Loading questions…</div>';

  var cacheKey = bookletId + '/' + subjectKey + '/' + chapterName;
  if (!_cache[cacheKey]) {
    var result = await db
      .from('questions')
      .select('*')
      .eq('exam_type', 'booklet')
      .eq('booklet_id', bookletId)
      .eq('chapter', chapterName);

    if (result.error || !result.data) {
      wrap.innerHTML = '<p style="color:var(--red);padding:1rem">Failed to load questions: ' + (result.error ? result.error.message : 'No data') + '</p>';
      return;
    }
    _cache[cacheKey] = normalise(result.data);
  }

  var questions = _cache[cacheKey];

  qState.mode      = 'booklet';
  qState.subject   = subjectKey.toLowerCase();
  qState.chapter   = chapterName;
  qState.questions = questions;
  qState.index     = 0;
  qState.answered  = false;
  qState.statuses  = questions.map(function() { return 'unseen'; });

  renderBookletSolver(bookletId, bookletFolder, subjectKey, chapterName, questions);
}

function renderBookletSolver(bookletId, bookletFolder, subjectKey, chapterName, questions) {
  var wrap = document.getElementById('booklet-content');
  wrap.innerHTML =
    '<div class="booklet-solver-wrap">' +

      // Left info panel
      '<div class="booklet-solver-info">' +
        '<button class="solver-back-btn" onclick="showBookletChapters(' +
          JSON.stringify(bookletId) + ',' + JSON.stringify(bookletFolder) + ',' +
          JSON.stringify(subjectKey) + ',' + JSON.stringify(subjectKey) + ')">← Chapters</button>' +
        '<div class="solver-panel-label" style="margin-top:0.4rem">Booklet</div>' +
        '<div style="font-weight:700;font-size:0.92rem;margin-bottom:0.2rem">' + _esc(chapterName) + '</div>' +
        '<div style="font-size:0.76rem;color:var(--text3);margin-bottom:0.8rem">' + _esc(subjectKey) + '</div>' +
        '<div style="height:1px;background:var(--border);margin:0.7rem 0"></div>' +
        '<div class="booklet-stat-row">' +
          '<div><div class="booklet-stat-val" id="bk-correct" style="color:var(--green)">0</div><div class="booklet-stat-lbl">Correct</div></div>' +
          '<div class="booklet-stat-sep">·</div>' +
          '<div><div class="booklet-stat-val" id="bk-wrong" style="color:var(--red)">0</div><div class="booklet-stat-lbl">Wrong</div></div>' +
          '<div class="booklet-stat-sep">·</div>' +
          '<div><div class="booklet-stat-val" style="color:var(--accent)">' + questions.length + '</div><div class="booklet-stat-lbl">Total</div></div>' +
        '</div>' +
      '</div>' +

      // Right solver
      '<div class="solver-right">' +
        '<div class="solver-panel-card solver-qnav-card">' +
          '<div class="solver-qnav-header">' +
            '<span class="solver-qnav-title" id="qnav-title">' + _esc(chapterName) + ' (' + questions.length + ')</span>' +
            '<div class="solver-qnav-legend">' +
              '<span class="legend-pip" style="background:var(--green)"></span>Correct ' +
              '<span class="legend-pip" style="background:var(--red)"></span>Wrong ' +
              '<span class="legend-pip" style="background:var(--orange)"></span>Skipped ' +
              '<span class="legend-pip" style="background:var(--surface2,#2a2a35)"></span>Unseen' +
            '</div>' +
          '</div>' +
          '<div class="solver-qnav-grid" id="q-nav-grid"></div>' +
        '</div>' +

        '<div class="solver-panel-card solver-q-card" id="q-card">' +
          '<div id="empty-state-q" class="solver-empty-state hidden"></div>' +
          '<div id="q-content">' +
            '<div class="solver-q-meta" id="q-meta"></div>' +
            '<div class="solver-q-text" id="q-text"></div>' +
            '<img id="q-image" class="solver-q-image hidden" alt=""/>' +
            '<div class="solver-options-grid" id="options-grid"></div>' +
            '<div id="integer-wrap" class="solver-integer-box hidden">' +
              '<label>Enter your numerical answer:</label>' +
              '<div class="solver-integer-row">' +
                '<input type="number" step="any" class="solver-integer-input" id="integer-input"/>' +
                '<button class="solver-btn solver-btn-check" id="btn-check-int">Check</button>' +
              '</div>' +
              '<div class="solver-integer-feedback" id="integer-feedback"></div>' +
            '</div>' +
            '<div class="solver-explanation" id="explanation-box">' +
              '<div class="solver-explanation-label">✦ Solution</div>' +
              '<div class="solver-explanation-text" id="explanation-text"></div>' +
            '</div>' +
            '<div class="solver-q-actions">' +
              '<button class="solver-btn solver-btn-ghost" id="btn-skip">Skip</button>' +
              '<button class="solver-btn solver-btn-primary" id="btn-next" disabled>Next →</button>' +
              '<span class="solver-q-progress" id="q-progress">1 / ' + questions.length + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

    '</div>';

  // Wire booklet buttons
  wrap.querySelector('#btn-next').addEventListener('click', function() {
    if (qState.index < qState.questions.length - 1) { qState.index++; }
    else { qState.index = 0; }
    qState.answered = false;
    loadQuestion(); updateQNav(); updateBookletStats();
  });
  wrap.querySelector('#btn-skip').addEventListener('click', function() {
    if (qState.statuses[qState.index] === 'unseen') qState.statuses[qState.index] = 'skipped';
    updateQNav();
    if (qState.index < qState.questions.length - 1) { qState.index++; }
    else { qState.index = 0; }
    qState.answered = false;
    loadQuestion(); updateQNav(); updateBookletStats();
  });
  wrap.querySelector('#btn-check-int').addEventListener('click', function() {
    if (qState.answered) return;
    var val = wrap.querySelector('#integer-input').value.trim();
    if (!val) return;
    qState.answered = true;
    var q = qState.questions[qState.index];
    var isCorrect = Number(val) === Number(q.answer);
    wrap.querySelector('#integer-input').classList.add(isCorrect ? 'correct' : 'wrong');
    var fb = wrap.querySelector('#integer-feedback');
    fb.className = 'solver-integer-feedback ' + (isCorrect ? 'correct' : 'wrong');
    fb.textContent = isCorrect ? '✓ Correct!' : '✗ Wrong. Answer: ' + q.answer;
    finalize(isCorrect, q);
  });

  buildQNav();
  loadQuestion();
  updateBookletStats();
}

function updateBookletStats() {
  var bc = document.getElementById('booklet-content');
  if (!bc) return;
  var cEl = bc.querySelector('#bk-correct');
  var wEl = bc.querySelector('#bk-wrong');
  if (cEl) cEl.textContent = qState.statuses.filter(function(s) { return s === 'correct'; }).length;
  if (wEl) wEl.textContent = qState.statuses.filter(function(s) { return s === 'wrong';   }).length;
}

// ═══════════════════════════════════════════════════════════
//  Normalise DB rows → question shape the renderer expects
// ═══════════════════════════════════════════════════════════
function normalise(rows) {
  return (rows || []).map(function(r) {
    return {
      _dbId:                 r.id,
      id:                    r.id,
      chapter:               r.chapter,
      difficulty:            r.difficulty,
      type:                  r.type,
      text:                  r.question_text,
      image:                 r.question_image_url || '',
      options:               r.options || [],
      correct:               r.type === 'mcq' ? Number(r.correct_answer) : undefined,
      answer:                r.type === 'integer' ? Number(r.correct_answer) : undefined,
      explanation:           r.explanation || '',
      explanation_image_url: r.explanation_image_url || null,
      year:                  r.year,
      shift:                 r.shift,
      subject:               r.subject,
      booklet_id:            r.booklet_id,
    };
  });
}

// ═══════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════
function _esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _formatText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function renderMath(el) {
  if (!el || !window.renderMathInElement) return;
  setTimeout(function() {
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true  },
        { left: '$',  right: '$',  display: false },
      ],
      throwOnError: false,
    });
  }, 30);
}