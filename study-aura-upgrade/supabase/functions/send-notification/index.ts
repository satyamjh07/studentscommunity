// ============================================
// STUDY AURA — Edge Function: send-notification
// POST /functions/v1/send-notification
//
// Only allows users with role = 'admin' to send notifications.
// Does NOT rely on frontend email check.
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

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

  // ── Role check: admin only ───────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return errorResponse('Forbidden: admin access required', 403);
  }

  // ── Parse body ───────────────────────────────────────────────────────
  let body: { title?: string; message?: string; user_id?: string | null };
  try { body = await req.json(); }
  catch { return errorResponse('Invalid JSON body'); }

  const title = (body.title || '').trim();
  const message = (body.message || '').trim();
  const targetUserId = body.user_id ?? null; // null = broadcast to all

  if (!title) return errorResponse('Title is required');
  if (!message) return errorResponse('Message is required');
  if (title.length > 100) return errorResponse('Title too long (max 100 chars)');
  if (message.length > 1000) return errorResponse('Message too long (max 1000 chars)');

  // ── Insert notification ──────────────────────────────────────────────
  // user_id = null  → broadcast (all users see it via RLS policy)
  // user_id = <id>  → personal notification for one user
  const { data: notification, error: insertErr } = await supabase
    .from('notifications')
    .insert({ title, message, user_id: targetUserId })
    .select()
    .single();

  if (insertErr) return errorResponse('Failed to send notification: ' + insertErr.message, 500);

  return corsResponse({
    success: true,
    notification,
    broadcast: targetUserId === null,
    message: targetUserId
      ? 'Personal notification sent'
      : 'Broadcast notification sent to all users',
  });
});
