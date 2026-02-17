import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[delete-account] Auth header present:', !!authHeader);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    // Client A: user-scoped (anon key + forwarded JWT) — for identity validation only
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Client B: service role — for admin actions (delete user, bypass RLS)
    const adminClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Validate the calling user
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error('[delete-account] User validation failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[delete-account] Deleting data for user:', user.id);

    // Clean up user data using admin client (bypasses RLS)
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

    // Delete the auth user using service role
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error('[delete-account] Delete failed:', deleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Account deleted successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
