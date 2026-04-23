// ============================================
// STUDY AURA — Edge Function: calculate-aura
// POST /functions/v1/calculate-aura
//
// Calculates a user's Aura Score server-side.
// Formula:
//   Aura = (hours_last_7_days * 5) + (streak * 3) + consistency_bonus
//   consistency_bonus = +10 if studied 3+ consecutive days
//
// Aura Levels:
//   0–30   → "Delusional 💀"
//   30–50  → "Trying..."
//   50–70  → "Serious Aspirant 🔥"
//   70–90  → "Top Grinder ⚡"
//   90+    → "AIR <100 Material 🧠"
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  // ── Auth: require a valid JWT ──────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Missing Authorization header', 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Verify the JWT and get the calling user
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return errorResponse('Unauthorized', 401);

  // ── Parse body ─────────────────────────────────────────────────────
  let body: { user_id?: string };
  try { body = await req.json(); }
  catch { body = {}; }

  // Allow an admin to query any user_id; otherwise force own id
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = callerProfile?.role === 'admin';
  const targetUserId = (isAdmin && body.user_id) ? body.user_id : user.id;

  // ── Fetch completed sessions ───────────────────────────────────────
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const { data: sessions, error: sessErr } = await supabase
    .from('study_sessions')
    .select('start_time, duration_seconds')
    .eq('user_id', targetUserId)
    .eq('status', 'complete')
    .order('start_time', { ascending: false });

  if (sessErr) return errorResponse('Failed to fetch sessions: ' + sessErr.message, 500);

  const allSessions = sessions || [];

  // ── Hours in last 7 days ───────────────────────────────────────────
  const recentSessions = allSessions.filter(
    (s) => new Date(s.start_time) >= sevenDaysAgo
  );
  const totalSecondsRecent = recentSessions.reduce(
    (sum, s) => sum + (s.duration_seconds || 0), 0
  );
  const hoursLast7Days = totalSecondsRecent / 3600;

  // ── Streak (consecutive days up to today) ─────────────────────────
  const studyDaySet = new Set(
    allSessions.map((s) => {
      const d = new Date(s.start_time);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })
  );

  let streak = 0;
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);
  let checkDate = new Date(todayMidnight);

  while (studyDaySet.has(checkDate.getTime())) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // ── Consistency bonus ──────────────────────────────────────────────
  const consistencyBonus = streak >= 3 ? 10 : 0;

  // ── Aura Score ─────────────────────────────────────────────────────
  const rawScore = (hoursLast7Days * 5) + (streak * 3) + consistencyBonus;
  const auraScore = Math.round(rawScore * 10) / 10; // one decimal place

  // ── Aura Level ─────────────────────────────────────────────────────
  function getAuraLevel(score: number): string {
    if (score < 30) return 'Delusional 💀';
    if (score < 50) return 'Trying...';
    if (score < 70) return 'Serious Aspirant 🔥';
    if (score < 90) return 'Top Grinder ⚡';
    return 'AIR <100 Material 🧠';
  }
  const auraLevel = getAuraLevel(auraScore);

  // ── Percentile (compare with all users based on their last-7-day hours) ──
  // We fetch a lightweight summary of all users to compute a rough percentile
  let percentile = 50; // default fallback
  try {
    const { data: allUserSessions } = await supabase
      .from('study_sessions')
      .select('user_id, duration_seconds')
      .eq('status', 'complete')
      .gte('start_time', sevenDaysAgo.toISOString());

    if (allUserSessions && allUserSessions.length > 0) {
      // Sum hours per user
      const userHoursMap: Record<string, number> = {};
      for (const s of allUserSessions) {
        userHoursMap[s.user_id] = (userHoursMap[s.user_id] || 0) + (s.duration_seconds || 0);
      }
      const allHours = Object.values(userHoursMap).map((sec) => sec / 3600);
      const below = allHours.filter((h) => h < hoursLast7Days).length;
      percentile = Math.round((below / allHours.length) * 100);
    }
  } catch {
    // Percentile is best-effort; don't fail the whole request
  }

  // ── Upsert aura_score into profiles for fast display ──────────────
  await supabase
    .from('profiles')
    .update({ aura_score: auraScore, aura_level: auraLevel })
    .eq('id', targetUserId);

  return corsResponse({
    user_id: targetUserId,
    aura_score: auraScore,
    aura_level: auraLevel,
    percentile,
    breakdown: {
      hours_last_7_days: Math.round(hoursLast7Days * 10) / 10,
      streak,
      consistency_bonus: consistencyBonus,
    },
  });
});
