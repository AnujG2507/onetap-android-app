

## Fix: delete-account 401/403 on External Supabase Project — RESOLVED

### Root Cause (two issues)

1. **401 Unauthorized** — The default `verify_jwt = true` gateway setting rejected requests before function code ran. Fixed by deploying with `--no-verify-jwt`.
2. **403 not_admin** — The original single-client pattern used the service role key for both auth validation and admin actions. `auth.getUser()` worked, but `auth.admin.deleteUser()` failed because the forwarded user JWT overrode the service role context.

### Solution: Two-Client Pattern

The function now uses two separate Supabase clients:

| Client | Key | Purpose |
|--------|-----|---------|
| `userClient` | `SUPABASE_ANON_KEY` + forwarded JWT | Identity validation via `auth.getUser()` |
| `adminClient` | `SUPABASE_SERVICE_ROLE_KEY` (no JWT) | Data deletion (bypasses RLS) and `auth.admin.deleteUser()` |

### Current State (all complete)

| Item | Status |
|------|--------|
| Two-client pattern (userClient + adminClient) | ✅ Implemented |
| Bearer prefix validation | ✅ Implemented |
| Debug logging | ✅ Implemented |
| Frontend auth header passing | ✅ Already correct |
| Deploy to external project with `--no-verify-jwt` | Manual step (run after each code change) |

### Deployment command

```bash
npx supabase functions deploy delete-account \
  --project-ref xfnugumyjhnctmqgiyqm \
  --no-verify-jwt
```

