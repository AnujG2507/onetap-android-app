import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- CORS ---
const ALLOWED_ORIGINS = [
  'capacitor://localhost',
  'http://localhost',
  'https://onetapapp.in',
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(allowed =>
    origin === allowed || origin.startsWith(allowed + ':')
  );
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  };
}

serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[delete-account] Auth header present:', !!authHeader);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const adminClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error('[delete-account] User validation failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[delete-account] Deleting data for user:', user.id);

    const { error: bookmarksError } = await adminClient
      .from('cloud_bookmarks').delete().eq('user_id', user.id);
    if (bookmarksError) console.error('Error deleting bookmarks:', bookmarksError);

    const { error: trashError } = await adminClient
      .from('cloud_trash').delete().eq('user_id', user.id);
    if (trashError) console.error('Error deleting trash:', trashError);

    const { error: scheduledError } = await adminClient
      .from('cloud_scheduled_actions').delete().eq('user_id', user.id);
    if (scheduledError) console.error('Error deleting scheduled actions:', scheduledError);

    const { error: shortcutsError } = await adminClient
      .from('cloud_shortcuts').delete().eq('user_id', user.id);
    if (shortcutsError) console.error('Error deleting shortcuts:', shortcutsError);

    const { error: deletedEntitiesError } = await adminClient
      .from('cloud_deleted_entities').delete().eq('user_id', user.id);
    if (deletedEntitiesError) console.error('Error deleting deletion records:', deletedEntitiesError);

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error('[delete-account] Delete failed:', deleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete account' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Account deleted successfully' }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
