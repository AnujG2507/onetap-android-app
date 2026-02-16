

## Fix: delete-account 401 on External Supabase Project

### Root Cause

The app uses a custom Supabase client pointing to the **external project** (`xfnugumyjhnctmqgiyqm`). When `supabase.functions.invoke('delete-account')` is called, it targets that external project's edge functions URL. The Lovable Cloud auto-deploy puts the function on the **wrong project** (`qyokhlaexuywzuyasqxo`).

Even if manually deployed to the external project, the default `verify_jwt = true` gateway setting can reject requests before the function code runs -- especially with Supabase's newer signing-keys system.

### Changes

#### 1. Update `supabase/functions/delete-account/index.ts`

- Strengthen the auth header check to validate `Bearer ` prefix
- Add temporary debug logging to confirm the header arrives in logs

```
Line 16: Change
  if (!authHeader)
to
  if (!authHeader || !authHeader.startsWith('Bearer '))

Add after line 21:
  console.log('[delete-account] Auth header present:', !!authHeader);
```

No other code changes needed -- the single-client pattern with service role key + forwarded auth is already correct from the last edit.

#### 2. No frontend changes needed

`ProfilePage.tsx` line 135-138 already correctly calls:
```
supabase.functions.invoke('delete-account', {
  headers: { Authorization: `Bearer ${session.access_token}` }
})
```

This targets the external project URL via the custom client in `src/lib/supabaseClient.ts`.

#### 3. Deployment to external project (manual step)

After the code change, you must deploy with `verify_jwt` disabled:

```bash
# Deploy with JWT verification disabled at the gateway level
npx supabase functions deploy delete-account \
  --project-ref xfnugumyjhnctmqgiyqm \
  --no-verify-jwt
```

The `--no-verify-jwt` flag prevents the Supabase gateway from rejecting requests before they reach the function. The function still validates auth internally via `supabase.auth.getUser()`.

### What will NOT be changed

- `supabase/config.toml` -- this only affects the Lovable Cloud project, which is irrelevant here
- `src/lib/supabaseClient.ts` -- already correctly configured
- `src/components/ProfilePage.tsx` -- already passes the token correctly

### Summary

| Item | Status |
|------|--------|
| Edge function code (single client pattern) | Already correct |
| Bearer prefix validation | Will be added |
| Debug logging | Will be added |
| Frontend auth header passing | Already correct |
| Deploy to external project with --no-verify-jwt | Manual step after code change |

