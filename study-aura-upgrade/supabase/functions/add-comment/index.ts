// ============================================
// STUDY AURA — Edge Function: add-comment
// POST /functions/v1/add-comment
//
// Validates auth, mute status, rate limit (20 comments/hour).
// ============================================
// @ts-ignore

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

const MAX_COMMENTS_PER_HOUR = 20;
const MAX_CONTENT_LENGTH = 1000;

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
  let body: { post_id?: string; content?: string };
  try { body = await req.json(); }
  catch { return errorResponse('Invalid JSON body'); }

  const { post_id, content: rawContent } = body;
  const content = (rawContent || '').trim();

  if (!post_id) return errorResponse('post_id is required');
  if (!content) return errorResponse('Comment content cannot be empty');
  if (content.length > MAX_CONTENT_LENGTH) {
    return errorResponse(`Comment too long. Maximum is ${MAX_CONTENT_LENGTH} characters.`);
  }

  // ── Check profile + mute status ─────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, muted_until')
    .eq('id', user.id)
    .single();

  if (!profile) return errorResponse('Profile not found', 404);

  if (profile.muted_until && new Date(profile.muted_until) > new Date()) {
    const until = new Date(profile.muted_until).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit'
    });
    return errorResponse(`You are muted until ${until}.`, 403);
  }

  // ── Verify the post exists ───────────────────────────────────────────
  const { data: post } = await supabase
    .from('posts')
    .select('id')
    .eq('id', post_id)
    .maybeSingle();

  if (!post) return errorResponse('Post not found', 404);

  // ── Rate limiting: max 20 comments per hour ─────────────────────────
  const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', oneHourAgo);

  if ((recentCount || 0) >= MAX_COMMENTS_PER_HOUR) {
    return errorResponse(
      `Rate limit: max ${MAX_COMMENTS_PER_HOUR} comments per hour.`,
      429
    );
  }

  // ── Insert comment ───────────────────────────────────────────────────
  const { data: newComment, error: insertErr } = await supabase
    .from('comments')
    .insert({ post_id, user_id: user.id, content })
    .select()
    .single();

  if (insertErr) return errorResponse('Failed to add comment: ' + insertErr.message, 500);

  return corsResponse({ success: true, comment: newComment });
});
