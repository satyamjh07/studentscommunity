// ============================================
// STUDY AURA — Edge Function: save-session
// POST /functions/v1/save-session
//
// Validates and saves a study session server-side.
// Anti-cheat: rejects sessions < 1 min or > 10 hrs.
// Duration is ALWAYS computed here, never trusted from frontend.
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

const MIN_SECONDS = 60;           // 1 minute
const MAX_SECONDS = 10 * 3600;    // 10 hours

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  // ── Auth ────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Missing Authorization header', 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return errorResponse('Unauthorized', 401);

  // ── Parse body ──────────────────────────────────────────────────────
  let body: { start_time?: string; end_time?: string };
  try { body = await req.json(); }
  catch { return errorResponse('Invalid JSON body'); }

  const { start_time, end_time } = body;
  if (!start_time || !end_time) {
    return errorResponse('start_time and end_time are required');
  }

  const startDate = new Date(start_time);
  const endDate = new Date(end_time);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return errorResponse('Invalid date format. Use ISO 8601 strings.');
  }

  // ── Server-side duration calculation ───────────────────────────────
  const durationSeconds = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);

  // ── Anti-cheat validation ───────────────────────────────────────────
  if (durationSeconds < MIN_SECONDS) {
    return errorResponse(`Session too short (${durationSeconds}s). Minimum is ${MIN_SECONDS}s.`);
  }
  if (durationSeconds > MAX_SECONDS) {
    return errorResponse(
      `Session too long (${Math.round(durationSeconds / 3600)}h). Maximum is 10 hours.`
    );
  }

  // ── Check for existing active session to update ────────────────────
  const { data: existingSession } = await supabase
    .from('study_sessions')
    .select('id')
    .eq('user_id', user.id)
    .eq('start_time', start_time)
    .eq('status', 'active')
    .maybeSingle();

  let result;
  if (existingSession) {
    // Update the existing active session record
    result = await supabase
      .from('study_sessions')
      .update({
        end_time: end_time,
        duration_seconds: durationSeconds,
        status: 'complete',
      })
      .eq('id', existingSession.id)
      .select()
      .single();
  } else {
    // Insert a brand new complete session (fallback: no active row found)
    result = await supabase
      .from('study_sessions')
      .insert({
        user_id: user.id,
        start_time,
        end_time,
        duration_seconds: durationSeconds,
        status: 'complete',
      })
      .select()
      .single();
  }

  if (result.error) {
    return errorResponse('Failed to save session: ' + result.error.message, 500);
  }

  return corsResponse({
    success: true,
    session: result.data,
    duration_seconds: durationSeconds,
    message: `Session saved: ${Math.floor(durationSeconds / 60)} minutes`,
  });
});
