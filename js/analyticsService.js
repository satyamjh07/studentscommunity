// js/analyticsService.js
// Uses global: db (from config.js)
// Call these functions from any page after config.js is loaded

// ── Weakness Report ───────────────────────────────────────────
// Returns array sorted weakest chapter first:
// [{ subject, chapter, total, correct, accuracy }, ...]
async function getWeaknessReport(userId) {
  var result = await db
    .from('user_attempts')
    .select('is_correct, questions!inner(subject, chapter, difficulty)')
    .eq('user_id', userId);

  if (result.error || !result.data) return [];

  var map = {};
  result.data.forEach(function (row) {
    var key = row.questions.subject + '/' + row.questions.chapter;
    if (!map[key]) {
      map[key] = {
        subject: row.questions.subject,
        chapter: row.questions.chapter,
        total:   0,
        correct: 0,
      };
    }
    map[key].total++;
    if (row.is_correct) map[key].correct++;
  });

  return Object.values(map)
    .map(function (c) {
      return Object.assign({}, c, { accuracy: Math.round(c.correct / c.total * 100) });
    })
    .sort(function (a, b) { return a.accuracy - b.accuracy; }); // weakest first
}

// ── Mistake Revision Set ──────────────────────────────────────
// Returns questions the user got wrong (latest attempt per question)
// Optional subject filter
async function getMistakeRevisionSet(userId, subject) {
  var attemptsResult = await db
    .from('user_attempts')
    .select('question_id, is_correct, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!attemptsResult.data || !attemptsResult.data.length) return [];

  // Keep only latest attempt per question
  var latest = {};
  attemptsResult.data.forEach(function (a) {
    if (!latest[a.question_id]) latest[a.question_id] = a;
  });

  var wrongIds = Object.values(latest)
    .filter(function (a) { return !a.is_correct; })
    .map(function (a) { return a.question_id; });

  if (!wrongIds.length) return [];

  var q = db.from('questions').select('*').in('id', wrongIds);
  if (subject) q = q.eq('subject', subject);

  var qResult = await q;
  if (qResult.error) return [];
  return _normaliseQuestions(qResult.data);
}

// ── Smart Practice Set ────────────────────────────────────────
// Returns questions from the user's 3 weakest chapters
async function getSmartPracticeSet(userId, limit) {
  limit = limit || 20;
  var report = await getWeaknessReport(userId);

  if (!report.length) {
    // No history — return random questions
    var fallback = await db.from('questions').select('*').limit(limit);
    return fallback.data ? _normaliseQuestions(fallback.data) : [];
  }

  var weakChapters = report.slice(0, 3).map(function (r) { return r.chapter; });

  var result = await db
    .from('questions')
    .select('*')
    .in('chapter', weakChapters)
    .limit(limit);

  if (result.error) return [];
  return _normaliseQuestions(result.data);
}

// ── Internal normaliser (mirrors solver.js normalise()) ───────
function _normaliseQuestions(rows) {
  return (rows || []).map(function (r) {
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