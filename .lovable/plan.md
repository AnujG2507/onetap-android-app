

## Workaround: Override Supabase Client to Use External Project

Since the auto-generated `client.ts` and `.env` files cannot be edited directly, the workaround is to create a **wrapper client** that hardcodes your external project credentials and then update all imports across the app to use it instead.

### Approach

1. Create a new file `src/lib/supabaseClient.ts` that creates a Supabase client pointing to your external project (`xfnugumyjhnctmqgiyqm`)
2. Update all 7 files that import from `@/integrations/supabase/client` to import from `@/lib/supabaseClient` instead

### Files to Create

**`src/lib/supabaseClient.ts`** -- New file that creates the client with your external credentials hardcoded:
- URL: `https://xfnugumyjhnctmqgiyqm.supabase.co`
- Anon Key: your provided key
- Same auth config (localStorage, persistSession, autoRefreshToken)
- Re-exports the `Database` type from the auto-generated types file (the schema is identical)

### Files to Update (import path change only)

All 7 files change their import from:
```text
import { supabase } from '@/integrations/supabase/client';
```
to:
```text
import { supabase } from '@/lib/supabaseClient';
```

The affected files:
1. `src/hooks/useAuth.ts`
2. `src/pages/AuthCallback.tsx`
3. `src/lib/oauthCompletion.ts`
4. `src/hooks/useUrlMetadata.ts`
5. `src/lib/cloudSync.ts`
6. `src/hooks/useOAuthRecovery.ts`
7. `src/components/ProfilePage.tsx`

### Why This Works

- The auto-generated `client.ts` still exists but is no longer imported by any app code
- Your external credentials are used for all auth, sync, and API calls
- The `Database` type is reused since both projects have the same schema
- No auto-managed files are modified

### Security Note

The anon key is a publishable key (safe to include in client code). It is not a secret -- it only grants access that RLS policies allow.

