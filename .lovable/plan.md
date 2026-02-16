

## Fix: delete-account Edge Function 401 Error

### Problem
The `delete-account` edge function returns 401 even with a valid JWT. The function currently creates two separate Supabase clients — one with the anon key for user validation, and one with the service role key for deletions. The anon-key client with forwarded auth can fail to validate users in edge function environments.

### Changes

#### 1. Update `supabase/functions/delete-account/index.ts`

- **Use service role key for user validation client** (with forwarded Authorization header). This is the proven pattern from the Supabase documentation — the service role key ensures `getUser()` can always resolve the JWT, while the forwarded Authorization header scopes the auth check to the calling user.
- **Expand CORS allowed headers** to include all headers the Supabase JS client sends (`x-supabase-client-platform`, `x-supabase-client-platform-version`, `x-supabase-client-runtime`, `x-supabase-client-runtime-version`).
- **Consolidate to a single admin client** instead of two separate clients — create one client with the service role key and forwarded auth header, use it for both user validation and data deletion.

```text
Before (two clients):
  userClient  = createClient(url, ANON_KEY, { headers: Authorization })
  adminClient = createClient(url, SERVICE_ROLE_KEY)

After (one client):
  supabase = createClient(url, SERVICE_ROLE_KEY, { headers: Authorization })
  // getUser() validates the JWT
  // delete operations use service role to bypass RLS
```

#### 2. No frontend changes needed

`src/components/ProfilePage.tsx` already correctly:
- Gets the session via `supabase.auth.getSession()`
- Passes `Authorization: Bearer ${session.access_token}` in the invoke call
- Uses the custom client from `@/lib/supabaseClient` (pointing to external project)

### After Implementation

You must redeploy the updated function to your external project:
```bash
npx supabase functions deploy delete-account --project-ref xfnugumyjhnctmqgiyqm
```

