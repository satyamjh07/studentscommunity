// ============================================
// STUDY AURA — Edge Function: create-post
// POST /functions/v1/create-post
//
// Validates auth + applies rate limiting (5 posts/hour).
// Checks mute status server-side.
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

const MAX_POSTS_PER_HOUR = 5;
const MAX_CONTENT_LENGTH = 2000;

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
  let body: { content?: string };
  try { body = await req.json(); }
  catch { return errorResponse('Invalid JSON body'); }

  const content = (body.content || '').trim();
  if (!content) return errorResponse('Post content cannot be empty');
  if (content.length > MAX_CONTENT_LENGTH) {
    return errorResponse(`Post too long. Maximum is ${MAX_CONTENT_LENGTH} characters.`);
  }

  // ── Check profile exists + mute status (server-side) ───────────────
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, name, muted_until, role')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile) return errorResponse('Profile not found. Complete onboarding first.', 404);

  if (profile.muted_until && new Date(profile.muted_until) > new Date()) {
    const until = new Date(profile.muted_until).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit'
    });
    return errorResponse(`You are muted until ${until}. You cannot post right now.`, 403);
  }

  // ── Rate limiting: max 5 posts per hour ────────────────────────────
  const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count: recentPostCount } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', oneHourAgo);

  if ((recentPostCount || 0) >= MAX_POSTS_PER_HOUR) {
    return errorResponse(
      `Rate limit: you can only post ${MAX_POSTS_PER_HOUR} times per hour. Try again later.`,
      429
    );
  }

  // ── Insert post ─────────────────────────────────────────────────────
  const { data: newPost, error: insertErr } = await supabase
    .from('posts')
    .insert({ user_id: user.id, content })
    .select()
    .single();

  if (insertErr) return errorResponse('Failed to create post: ' + insertErr.message, 500);

  return corsResponse({ success: true, post: newPost });
});
