

## ✅ COMPLETED: Fix Profile Stays Signed Out After OAuth Callback

### What Was Done

Switched from PKCE to **implicit OAuth flow** to fix the Android sign-in issue where the app opened after OAuth but stayed in a signed-out state.

### Root Cause

1. **PKCE code verifier mismatch**: On Android, `signInWithOAuth` stores a PKCE code verifier in the WebView's localStorage. The OAuth flow opens Chrome (a separate process) which has no access to this localStorage. When the deep link returns the app, `exchangeCodeForSession` can't find the matching code verifier.

2. **Wrong parameter to `exchangeCodeForSession`**: The code was passing a full URL instead of just the authorization code string.

### Changes Made

| File | Change |
|---|---|
| `src/lib/supabaseClient.ts` | Added `flowType: 'implicit'` to auth config |
| `src/lib/oauthCompletion.ts` | Rewrote `completeOAuth` to handle implicit tokens via `setSession()`, added PKCE code exchange as fallback, updated `isOAuthCallback` to detect `access_token` |
| `native/android/.../AndroidManifest.xml` | Added custom scheme intent filter for `onetap://auth-callback` (done in prior step) |
| `ARCHITECTURE.md` | Updated OAuth section to document implicit flow and why PKCE doesn't work on native Android |
| `ANDROID_SETUP.md` | Updated OAuth deep link flow documentation |
| `SUPABASE.md` | Updated OAuth flow description and production setup checklist |
| `DEPLOYMENT.md` | Updated Supabase environment setup section |
| `APP_SUMMARY.md` | Updated backend description to mention implicit flow |

### External Configuration
- `onetap://auth-callback` must be in Supabase Authentication → Redirect URLs (already done)
- No other external changes needed — implicit flow works with the same redirect URL configuration
