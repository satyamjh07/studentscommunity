/* ═══════════════════════════════════════════════════════════════
   ZEROday — Dashboard Analytics Engine  (dashboard-analytics.js)
   Fully data-driven bindings for:
     • Day Streak  (KPI card + Study Streak section)
     • Overall Accuracy  (KPI card)
     • Questions Solved  (Today / This Week / This Month rings)
     • Subject Accuracy  (Physics / Chemistry / Maths gauges)
     • Performance Trend  (14-session SVG line chart)
     • Study Streak  (7-day pip row)
     • Top Chapters  (accuracy ≥ 75%, ranked highest first)
     • Weak Chapters  (accuracy < 75%, ranked lowest first)
     • Weak Topics    (topics most-missed from weak chapters)

   Depends on globals: db, currentUser  (from config.js / auth.js)
   Hooks into: window.goToPage() — re-runs every time dashboard opens.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Helpers ─────────────────────────────────────────── */
  function el(id) { return document.getElementById(id); }
  function setText(id, v) { var e = el(id); if (e && v !== undefined) e.textContent = v; }
  function setHtml(id, v) { var e = el(id); if (e) e.innerHTML = v; }

  function isoDate(d) {
    // Returns YYYY-MM-DD in local time
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* ── Main entry ──────────────────────────────────────── */
  async function loadDashboard() {
    if (typeof db === 'undefined' || typeof currentUser === 'undefined' || !currentUser) return;

    try {
      /* ── 1. Fetch ALL user_attempts joined with question metadata ── */
      var result = await db
        .from('user_attempts')
        .select('question_id, is_correct, created_at, questions!inner(subject, chapter, topic, difficulty)')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: true });

      if (result.error) {
        console.warn('[Analytics] user_attempts fetch error:', result.error.message);
        return;
      }

      var rows = result.data || [];

      /* ── 2. Build derived structures ───────────────────── */
      var now = new Date();

      // Activity map: 'YYYY-MM-DD' → count of questions attempted
      var activityMap = {};
      // Chapter map: 'subject/chapter' → { subject, chapter, total, correct, topics: { topicName: { total, correct } } }
      var chapterMap  = {};
      // Subject map:  subjectName → { total, correct, sessions: [{date, total, correct}] }
      var subjectMap  = { physics: {total:0,correct:0,sessions:[]}, chemistry: {total:0,correct:0,sessions:[]}, mathematics: {total:0,correct:0,sessions:[]} };
      // Session-based tracking (group by day per subject for trend chart)
      var sessionByDay = {}; // 'YYYY-MM-DD/subject' → {total, correct}

      rows.forEach(function (row) {
        var date   = isoDate(new Date(row.created_at));
        var subj   = (row.questions && row.questions.subject   || '').toLowerCase();
        var chap   = (row.questions && row.questions.chapter   || 'Unknown');
        var topic  = (row.questions && row.questions.topic     || '');
        var isCorr = !!row.is_correct;

        // Activity map
        activityMap[date] = (activityMap[date] || 0) + 1;

        // Chapter map
        var chapKey = subj + '/' + chap;
        if (!chapterMap[chapKey]) {
          chapterMap[chapKey] = { subject: subj, chapter: chap, total: 0, correct: 0, topics: {} };
        }
        chapterMap[chapKey].total++;
        if (isCorr) chapterMap[chapKey].correct++;

        // Topic map (inside chapter)
        if (topic) {
          if (!chapterMap[chapKey].topics[topic]) {
            chapterMap[chapKey].topics[topic] = { total: 0, correct: 0 };
          }
          chapterMap[chapKey].topics[topic].total++;
          if (isCorr) chapterMap[chapKey].topics[topic].correct++;
        }

        // Subject map
        var normSubj = subj === 'maths' || subj === 'math' ? 'mathematics' : subj;
        if (subjectMap[normSubj]) {
          subjectMap[normSubj].total++;
          if (isCorr) subjectMap[normSubj].correct++;
        }

        // Session by day per subject (for trend chart)
        var daySubjKey = date + '/' + normSubj;
        if (!sessionByDay[daySubjKey]) sessionByDay[daySubjKey] = { total: 0, correct: 0 };
        sessionByDay[daySubjKey].total++;
        if (isCorr) sessionByDay[daySubjKey].correct++;
      });

      /* ── 3. Compute streak ────────────────────────────── */
      var streak = computeStreak(activityMap, now);

      /* ── 4. Render each section ───────────────────────── */
      renderDayStreak(streak);
      renderOverallAccuracy(subjectMap);
      renderQuestionsSolved(rows, now);
      renderSubjectGauges(subjectMap);
      renderPerformanceTrend(sessionByDay, now);
      renderStudyStreakSection(streak, activityMap, now);
      renderChapters(chapterMap);
      renderWeakTopics(chapterMap);

    } catch (e) {
      console.error('[Analytics] Dashboard load error:', e);
    }
  }

  /* ══════════════════════════════════════════════════════
     STREAK COMPUTATION
     ══════════════════════════════════════════════════════ */
  function computeStreak(activityMap, now) {
    // Current streak: consecutive days ending today (or yesterday if today has 0)
    var currentStreak = 0;
    var d = new Date(now);
    d.setHours(0, 0, 0, 0);

    // If today has no activity, streak might end yesterday
    var checkDate = new Date(d);
    while (true) {
      var key = isoDate(checkDate);
      if (activityMap[key]) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        // If today has no activity, allow looking from yesterday
        if (checkDate.getTime() === d.getTime() && currentStreak === 0) {
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        }
        break;
      }
      if (currentStreak > 3650) break; // safety
    }

    // Best streak (scan all dates)
    var allDates = Object.keys(activityMap).filter(function(k){ return activityMap[k] > 0; }).sort();
    var bestStreak = 0;
    var runStreak = 0;
    var prevDate  = null;
    allDates.forEach(function(dateStr) {
      var curr = new Date(dateStr);
      if (prevDate) {
        var diff = (curr - prevDate) / 86400000;
        if (diff === 1) {
          runStreak++;
        } else {
          runStreak = 1;
        }
      } else {
        runStreak = 1;
      }
      if (runStreak > bestStreak) bestStreak = runStreak;
      prevDate = curr;
    });

    return { current: currentStreak, best: Math.max(bestStreak, currentStreak) };
  }

  /* ══════════════════════════════════════════════════════
     DAY STREAK — KPI card
     ══════════════════════════════════════════════════════ */
  function renderDayStreak(streak) {
    setText('streak-count', streak.current);
    setText('streak-best-label', 'Best: ' + streak.best + ' days');
  }

  /* ══════════════════════════════════════════════════════
     OVERALL ACCURACY — KPI card
     ══════════════════════════════════════════════════════ */
  function renderOverallAccuracy(subjectMap) {
    var totals = 0, corrects = 0;
    Object.values(subjectMap).forEach(function(s){ totals += s.total; corrects += s.correct; });
    var valEl = el('overall-accuracy-val');
    var subEl = el('overall-accuracy-sub');
    if (!valEl) return;
    if (totals === 0) {
      valEl.textContent = '—';
      if (subEl) subEl.textContent = 'Solve questions to track';
      return;
    }
    var acc = Math.round(corrects / totals * 100);
    valEl.textContent = acc + '%';
    if (subEl) {
      subEl.textContent = acc >= 75 ? '↑ Great consistency' :
                          acc >= 50 ? '→ Keep improving'    : '↓ Focus on weak areas';
    }
  }

  /* ══════════════════════════════════════════════════════
     QUESTIONS SOLVED — rings section
     ══════════════════════════════════════════════════════ */
  function renderQuestionsSolved(rows, now) {
    var todayStart  = new Date(now); todayStart.setHours(0,0,0,0);
    var weekStart   = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1); weekStart.setHours(0,0,0,0);
    if (now.getDay() === 0) weekStart.setDate(weekStart.getDate() - 6); // Sunday fix
    var monthStart  = new Date(now.getFullYear(), now.getMonth(), 1);

    var DAILY_TARGET   = 70;
    var WEEKLY_TARGET  = 350;
    var MONTHLY_TARGET = 1200;

    var todayN = rows.filter(function(r){ return new Date(r.created_at) >= todayStart; }).length;
    var weekN  = rows.filter(function(r){ return new Date(r.created_at) >= weekStart; }).length;
    var monthN = rows.filter(function(r){ return new Date(r.created_at) >= monthStart; }).length;

    function pct(n, t) { return Math.min(100, Math.round(n / t * 100)); }
    function dashOff(p) { return (150.8 * (1 - p / 100)).toFixed(1); }

    var todayP = pct(todayN, DAILY_TARGET);
    setText('qstat-today', todayN);
    setText('qstat-today-sub', 'of ' + DAILY_TARGET + ' daily target · ' + todayP + '%');
    setArc('qring-today-arc', dashOff(todayP));
    setText('qring-today-pct', todayP + '%');

    var weekP = pct(weekN, WEEKLY_TARGET);
    setText('qstat-week', weekN);
    setText('qstat-week-sub', 'of ' + WEEKLY_TARGET + ' weekly target · ' + weekP + '%');
    setArc('qring-week-arc', dashOff(weekP));
    setText('qring-week-pct', weekP + '%');

    var monthP = pct(monthN, MONTHLY_TARGET);
    setText('qstat-month', monthN.toLocaleString());
    setText('qstat-month-sub', 'of ' + MONTHLY_TARGET.toLocaleString() + ' monthly target · ' + monthP + '%');
    setArc('qring-month-arc', dashOff(monthP));
    setText('qring-month-pct', monthP + '%');
  }

  function setArc(id, offset) {
    var e = el(id); if (e) e.setAttribute('stroke-dashoffset', offset);
  }

  /* ══════════════════════════════════════════════════════
     SUBJECT ACCURACY GAUGES
     ══════════════════════════════════════════════════════ */
  function renderSubjectGauges(subjectMap) {
    var CIRC = 263.9;
    var subjects = [
      { key: 'physics',     color: 'var(--accent,#00f0ff)',   arcId: 'gauge-physics-arc',     pctId: 'gauge-physics-pct',     trendId: 'gauge-physics-trend' },
      { key: 'chemistry',   color: 'var(--purple,#b06aff)',   arcId: 'gauge-chemistry-arc',   pctId: 'gauge-chemistry-pct',   trendId: 'gauge-chemistry-trend' },
      { key: 'mathematics', color: 'var(--green,#00e5a0)',    arcId: 'gauge-mathematics-arc', pctId: 'gauge-mathematics-pct', trendId: 'gauge-mathematics-trend' }
    ];

    subjects.forEach(function(s) {
      var data = subjectMap[s.key];
      var pctEl    = el(s.pctId);
      var arcEl    = el(s.arcId);
      var trendEl  = el(s.trendId);

      if (!data || data.total === 0) {
        if (pctEl) { pctEl.textContent = '—'; pctEl.style.color = s.color; }
        if (trendEl) trendEl.textContent = 'No attempts yet';
        return;
      }

      var acc = Math.round(data.correct / data.total * 100);
      var offset = (CIRC * (1 - acc / 100)).toFixed(1);

      if (pctEl) { pctEl.textContent = acc + '%'; pctEl.style.color = s.color; }
      if (arcEl) arcEl.setAttribute('stroke-dashoffset', offset);
      if (trendEl) {
        trendEl.textContent = data.correct + '/' + data.total + ' correct';
        trendEl.className = 'an-gauge-trend ' + (acc >= 70 ? 'up' : acc >= 40 ? '' : 'down');
      }
    });
  }

  /* ══════════════════════════════════════════════════════
     PERFORMANCE TREND CHART  (last 14 active days)
     ══════════════════════════════════════════════════════ */
  function renderPerformanceTrend(sessionByDay, now) {
    // Collect all unique active dates (last 14 days that have data, or last 14 calendar days)
    var allKeys = Object.keys(sessionByDay);
    var uniqueDates = [];
    var seen = {};
    allKeys.forEach(function(k) {
      var d = k.split('/')[0];
      if (!seen[d]) { seen[d] = true; uniqueDates.push(d); }
    });
    uniqueDates.sort();

    // Use last 14 active dates; if fewer, pad from recent calendar days
    var last14 = uniqueDates.slice(-14);
    if (last14.length < 2) {
      // Not enough data — clear paths and show placeholder
      clearTrendPaths();
      return;
    }

    var WIDTH  = 700, HEIGHT = 180;
    var PAD_L  = 38,  PAD_R  = 12, PAD_T = 12, PAD_B = 20;
    var chartW = WIDTH - PAD_L - PAD_R;
    var chartH = HEIGHT - PAD_T - PAD_B;

    var subjects = ['physics', 'chemistry', 'mathematics'];
    var colors   = { physics: 'var(--accent,#00f0ff)', chemistry: 'var(--purple,#b06aff)', mathematics: 'var(--green,#00e5a0)' };
    var fillIds  = { physics: 'an-gcyan', chemistry: 'an-gpurple', mathematics: 'an-ggreen' };

    function accForDateSubj(date, subj) {
      var k = date + '/' + subj;
      var s = sessionByDay[k];
      if (!s || s.total === 0) return null;
      return s.correct / s.total * 100;
    }

    // Build subject series: fill nulls with linear interpolation
    function buildSeries(subj) {
      var raw = last14.map(function(d){ return accForDateSubj(d, subj); });
      // Forward-fill first non-null, backward fill rest
      var filled = raw.slice();
      var lastVal = 50;
      for (var i = 0; i < filled.length; i++) {
        if (filled[i] !== null) { lastVal = filled[i]; }
        else { filled[i] = lastVal; }
      }
      return filled;
    }

    function toPoints(series) {
      return series.map(function(v, i) {
        var x = PAD_L + (i / (last14.length - 1)) * chartW;
        var y = PAD_T + (1 - v / 100) * chartH;
        return [x.toFixed(1), y.toFixed(1)];
      });
    }

    function pointsToPath(pts) {
      return pts.map(function(p, i){ return (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1]; }).join(' ');
    }

    function pointsToFill(pts, fillY) {
      var d = pointsToPath(pts);
      d += ' L' + pts[pts.length-1][0] + ',' + fillY + ' L' + pts[0][0] + ',' + fillY + ' Z';
      return d;
    }

    subjects.forEach(function(subj) {
      var series = buildSeries(subj);
      var pts    = toPoints(series);
      var line   = pointsToPath(pts);
      var fill   = pointsToFill(pts, PAD_T + chartH);

      // Find path elements by stroke color matching or by a data-subj attribute
      // We'll rebuild the SVG paths directly
      updateTrendPath(subj + '-line', line);
      updateTrendFill(subj + '-fill', fill);
    });

    // Update x-axis labels
    updateTrendLabels(last14);

    // Update end-point dots
    subjects.forEach(function(subj, si) {
      var series = buildSeries(subj);
      var lastAcc = series[series.length - 1];
      var x = PAD_L + chartW;
      var y = (PAD_T + (1 - lastAcc / 100) * chartH).toFixed(1);
      updateTrendDot(subj + '-dot', x, y);
    });
  }

  function updateTrendPath(id, d) {
    var e = el(id); if (e) e.setAttribute('d', d);
  }
  function updateTrendFill(id, d) {
    var e = el(id); if (e) e.setAttribute('d', d);
  }
  function updateTrendDot(id, cx, cy) {
    var e = el(id); if (e) { e.setAttribute('cx', cx); e.setAttribute('cy', cy); }
  }
  function updateTrendLabels(dates) {
    var wrap = document.querySelector('.an-chart-x-labels');
    if (!wrap) return;
    var labels = dates.map(function(d, i) {
      var mo = new Date(d);
      return '<span>' + (mo.getMonth()+1) + '/' + mo.getDate() + '</span>';
    });
    wrap.innerHTML = labels.join('');
  }
  function clearTrendPaths() {
    ['physics-line','chemistry-line','mathematics-line',
     'physics-fill','chemistry-fill','mathematics-fill'].forEach(function(id){
      var e = el(id); if (e) e.setAttribute('d', '');
    });
  }

  /* ══════════════════════════════════════════════════════
     STUDY STREAK SECTION  (7-day pip row)
     ══════════════════════════════════════════════════════ */
  function renderStudyStreakSection(streak, activityMap, now) {
    // Streak count big
    setText('streak-count-big', streak.current);
    setText('streak-best-big', streak.best);

    var msg = streak.current === 0  ? 'Start your streak today!' :
              streak.current === 1  ? 'Day 1 — keep going!' :
              streak.current < 7   ? streak.current + ' days — building momentum' :
              streak.current < 30  ? 'On fire! 🔥 ' + streak.current + '-day streak!' :
                                     'Legendary! 🏆 ' + streak.current + ' days!';
    setText('streak-msg', msg);

    // Build 7-day pips
    var pipsEl = el('streak-pips');
    if (!pipsEl) return;

    var DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var html = '';
    for (var i = 6; i >= 0; i--) {
      var d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      var key  = isoDate(d);
      var name = DAY_NAMES[d.getDay()];
      var isToday  = (i === 0);
      var hasDone  = !!activityMap[key];
      var isFuture = false; // these are past days

      var pipClass, icon;
      if (isToday) {
        pipClass = 'an-streak-pip today';
        icon     = hasDone ? '✓' : '◉';
      } else if (hasDone) {
        pipClass = 'an-streak-pip done';
        icon     = '✓';
      } else {
        pipClass = 'an-streak-pip missed';
        icon     = '✕';
      }

      html += '<div class="an-streak-day">' +
                '<div class="an-streak-day-name">' + name + '</div>' +
                '<div class="' + pipClass + '">' + icon + '</div>' +
              '</div>';
    }
    pipsEl.innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════
     TOP & WEAK CHAPTERS
     ══════════════════════════════════════════════════════ */
  function renderChapters(chapterMap) {
    var chapters = Object.values(chapterMap).map(function(c) {
      return {
        subject:  c.subject,
        chapter:  c.chapter,
        total:    c.total,
        correct:  c.correct,
        accuracy: c.total > 0 ? Math.round(c.correct / c.total * 100) : 0
      };
    });

    var topChaps  = chapters.filter(function(c){ return c.accuracy >= 75; })
                            .sort(function(a,b){ return b.accuracy - a.accuracy; });
    var weakChaps = chapters.filter(function(c){ return c.accuracy < 75; })
                            .sort(function(a,b){ return a.accuracy - b.accuracy; });

    function badge(acc) {
      if (acc >= 90) return '<span class="an-badge-pill an-badge-top">Mastered</span>';
      if (acc >= 75) return '<span class="an-badge-pill an-badge-good">Strong</span>';
      if (acc >= 50) return '<span class="an-badge-pill an-badge-med">Average</span>';
      return '<span class="an-badge-pill an-badge-crit">Critical</span>';
    }

    function barColor(acc) {
      if (acc >= 75) return 'var(--green,#00e5a0)';
      if (acc >= 50) return 'var(--orange,#ff9340)';
      return 'var(--red,#ff4d6a)';
    }

    function subjectLabel(subj) {
      if (!subj) return '';
      return subj.charAt(0).toUpperCase() + subj.slice(1);
    }

    function buildRows(list, rankClass) {
      if (!list.length) return '<div class="an-empty-state">No chapters yet — keep solving!</div>';
      return list.map(function(c, i) {
        var rankTxt = i === 0 ? '#1' : '#' + (i+1);
        return '<div class="an-chapter-row">' +
          '<div class="an-chapter-rank ' + rankClass + '">' + rankTxt + '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div class="an-chapter-name">' + escHtml(c.chapter) + '</div>' +
            '<div class="an-chapter-sub">' + subjectLabel(c.subject) + ' · ' + c.total + ' attempts</div>' +
          '</div>' +
          badge(c.accuracy) +
          '<div class="an-chapter-bar-wrap"><div class="an-chapter-bar" style="width:' + c.accuracy + '%;background:' + barColor(c.accuracy) + '"></div></div>' +
          '<div class="an-chapter-score" style="color:' + barColor(c.accuracy) + '">' + c.accuracy + '%</div>' +
        '</div>';
      }).join('');
    }

    setHtml('top-chapters-list',  buildRows(topChaps,  'top'));
    setHtml('weak-chapters-list', buildRows(weakChaps, 'weak'));
  }

  /* ══════════════════════════════════════════════════════
     WEAK TOPICS — from weak chapters
     ══════════════════════════════════════════════════════ */
  function renderWeakTopics(chapterMap) {
    var topicGrid = document.querySelector('#an-weak-topics-grid');
    if (!topicGrid) {
      // Try to find the weak topics card body
      topicGrid = document.querySelector('.an-topic-grid');
    }
    if (!topicGrid) return;

    // Only pull topics from WEAK chapters (accuracy < 75%)
    var allTopics = [];
    Object.values(chapterMap).forEach(function(c) {
      var chapAcc = c.total > 0 ? c.correct / c.total : 1;
      if (chapAcc >= 0.75) return; // skip strong chapters

      Object.keys(c.topics).forEach(function(topicName) {
        var t = c.topics[topicName];
        if (t.total === 0) return;
        var acc = Math.round(t.correct / t.total * 100);
        allTopics.push({
          topic:   topicName,
          subject: c.subject,
          chapter: c.chapter,
          total:   t.total,
          correct: t.correct,
          accuracy: acc
        });
      });
    });

    // If no topic field in DB — group by chapter as fallback
    if (allTopics.length === 0) {
      // Fallback: show weak chapters as "topics"
      var weakChaps = Object.values(chapterMap).filter(function(c){
        return c.total > 0 && c.correct / c.total < 0.75;
      });
      weakChaps.sort(function(a, b) {
        return (a.correct/a.total) - (b.correct/b.total);
      });

      if (!weakChaps.length) {
        topicGrid.innerHTML = '<div class="an-empty-state">No weak topics found — great work!</div>';
        return;
      }

      topicGrid.innerHTML = weakChaps.slice(0, 8).map(function(c, i) {
        var acc = Math.round(c.correct / c.total * 100);
        var sev = acc < 33 ? 1 : acc < 55 ? 2 : 3;
        var icon = sev === 1 ? '#ic-zap' : sev === 2 ? '#ic-target' : '#ic-clock';
        return '<div class="an-topic-chip an-sev-' + sev + '">' +
          '<div class="an-topic-icon"><svg width="14" height="14"><use href="' + icon + '"/></svg></div>' +
          '<div class="an-topic-text">' +
            '<div class="an-topic-name">' + escHtml(c.chapter) + '</div>' +
            '<div class="an-topic-subject">' + capFirst(c.subject) + '</div>' +
          '</div>' +
          '<div class="an-topic-score">' + acc + '%</div>' +
        '</div>';
      }).join('');
      return;
    }

    // Sort by most-missed (lowest accuracy, most attempts first as tiebreaker)
    allTopics.sort(function(a, b) {
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      return b.total - a.total;
    });

    var top8 = allTopics.slice(0, 8);

    topicGrid.innerHTML = top8.map(function(t) {
      var sev  = t.accuracy < 33 ? 1 : t.accuracy < 55 ? 2 : 3;
      var icon = sev === 1 ? '#ic-zap' : sev === 2 ? '#ic-target' : '#ic-clock';
      return '<div class="an-topic-chip an-sev-' + sev + '">' +
        '<div class="an-topic-icon"><svg width="14" height="14"><use href="' + icon + '"/></svg></div>' +
        '<div class="an-topic-text">' +
          '<div class="an-topic-name">' + escHtml(t.topic) + '</div>' +
          '<div class="an-topic-subject">' + capFirst(t.subject) + '</div>' +
        '</div>' +
        '<div class="an-topic-score">' + t.accuracy + '%</div>' +
      '</div>';
    }).join('');
  }

  /* ── Utility ─────────────────────────────────────────── */
  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function capFirst(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ── Patch SVG paths with IDs for trend chart ──────── */
  function patchTrendSVG() {
    // The existing SVG has hardcoded paths. We need to give them IDs.
    // We'll select by stroke color attribute.
    var svg = document.querySelector('.an-perf-svg-wrap svg');
    if (!svg) return;

    // Find all <path> elements
    var paths = svg.querySelectorAll('path');
    paths.forEach(function(p) {
      var stroke = p.getAttribute('stroke') || '';
      var fill   = p.getAttribute('fill')   || '';

      if (stroke.indexOf('--accent') !== -1 || stroke.indexOf('#00f0ff') !== -1) {
        // Cyan = Physics line
        if (!p.id) p.id = 'physics-line';
      } else if (stroke.indexOf('--purple') !== -1 || stroke.indexOf('#b06aff') !== -1) {
        if (!p.id) p.id = 'chemistry-line';
      } else if (stroke.indexOf('--green') !== -1 || stroke.indexOf('#00e5a0') !== -1) {
        if (!p.id) p.id = 'mathematics-line';
      } else if (fill.indexOf('an-gcyan') !== -1 || fill.indexOf('url(#an-gcyan') !== -1) {
        if (!p.id) p.id = 'physics-fill';
      } else if (fill.indexOf('an-gpurple') !== -1 || fill.indexOf('url(#an-gpurple') !== -1) {
        if (!p.id) p.id = 'chemistry-fill';
      } else if (fill.indexOf('an-ggreen') !== -1 || fill.indexOf('url(#an-ggreen') !== -1) {
        if (!p.id) p.id = 'mathematics-fill';
      }
    });

    // Assign IDs to fill paths based on order (fill paths come before stroke in the SVG)
    // Fallback: just assign by index position
    var allPaths = Array.from(paths);
    var fillPaths   = allPaths.filter(function(p){ return p.getAttribute('fill') && p.getAttribute('fill').indexOf('url(') !== -1; });
    var strokePaths = allPaths.filter(function(p){ return p.getAttribute('stroke') && p.getAttribute('stroke') !== 'none' && p.getAttribute('fill') === 'none'; });

    var fillIds   = ['physics-fill', 'chemistry-fill', 'mathematics-fill'];
    var strokeIds = ['physics-line', 'chemistry-line', 'mathematics-line'];

    fillPaths.forEach(function(p, i)  { if (!p.id && fillIds[i])   p.id = fillIds[i]; });
    strokePaths.forEach(function(p, i){ if (!p.id && strokeIds[i]) p.id = strokeIds[i]; });

    // End-point circles
    var circles = svg.querySelectorAll('circle');
    var dotIds  = ['physics-dot', 'chemistry-dot', 'mathematics-dot'];
    circles.forEach(function(c, i){ if (!c.id && dotIds[i]) c.id = dotIds[i]; });
  }

  /* ── Boot ─────────────────────────────────────────────── */
  function boot() {
    patchTrendSVG();

    // Hook into goToPage
    var pollCount = 0;
    var poller = setInterval(function() {
      pollCount++;
      if (pollCount > 100) { clearInterval(poller); return; } // give up after 15s

      if (typeof window.goToPage !== 'function') return;
      clearInterval(poller);

      var _orig = window.goToPage;
      // Avoid double-patching
      if (_orig._analyticsPatched) return;

      window.goToPage = function(pageId) {
        _orig.apply(this, arguments);
        if (pageId === 'dashboard') {
          setTimeout(function() {
            if (typeof currentUser !== 'undefined' && currentUser) {
              loadDashboard();
            }
          }, 400);
        }
      };
      window.goToPage._analyticsPatched = true;

      // Also expose so auth.js can call after login
      window.loadDashboardAnalytics = loadDashboard;
    }, 150);

    // Also run when auth fires (user logs in and navigates to dashboard)
    document.addEventListener('zdDashboardOpen', function() {
      setTimeout(loadDashboard, 400);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose publicly
  window.loadDashboardAnalytics = loadDashboard;

})();