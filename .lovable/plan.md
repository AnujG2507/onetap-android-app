

## Fix: Profile Stays Signed Out After OAuth Callback

### Root Cause (Two Issues)

1. **Wrong parameter to `exchangeCodeForSession`**: The code currently passes a full URL (`https://placeholder/auth-callback?code=xxx`) but the method expects just the authorization code string (e.g., `abc123`).

2. **PKCE code verifier mismatch**: The Supabase client uses PKCE flow by default. When `signInWithOAuth` is called, a code verifier is stored in localStorage. However, on Android, the OAuth browser is a separate process -- the code verifier lives in the WebView's localStorage but the external Chrome browser has no access to it. When the deep link returns the app, `exchangeCodeForSession` can't find the matching code verifier, causing the "both auth code and code verifier should be non-empty" error.

### Solution

Switch the native OAuth flow to use **implicit flow** (not PKCE) and use `setSession` with the tokens returned in the URL fragment instead of exchanging a code.

---

### Changes

#### 1. `src/lib/supabaseClient.ts`
- Add `flowType: 'implicit'` to the auth config. This makes Supabase return tokens directly in the URL fragment instead of an auth code, eliminating the PKCE code verifier problem entirely.

```typescript
export const supabase = createClient<Database>(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    flowType: 'implicit',
  },
});
```

#### 2. `src/hooks/useAuth.ts`
- Remove `skipBrowserRedirect: true` from the native OAuth call (not needed with implicit flow since redirect happens automatically).
- Actually, keep `skipBrowserRedirect: true` for native since we still need to open the URL in an external browser manually via Capacitor Browser plugin.

#### 3. `src/lib/oauthCompletion.ts`
- Update `isOAuthCallback()` to also detect implicit flow tokens (`access_token=` in hash fragment).
- Update `completeOAuth()`:
  - For implicit flow: extract `access_token` and `refresh_token` from the URL hash fragment, then call `supabase.auth.setSession()`.
  - For PKCE flow (web fallback): extract just the `code` parameter and pass it to `exchangeCodeForSession()`.
  - Remove the broken `processableUrl` approach.

```typescript
// Key logic change in completeOAuth:
export async function completeOAuth(url: string): Promise<OAuthCompletionResult> {
  // ... existing dedup checks ...

  // Parse URL - handle both custom scheme and https
  let params: URLSearchParams;
  let hashParams: URLSearchParams;
  
  if (url.startsWith('onetap://')) {
    // Custom scheme: params are after ?
    const queryString = url.split('?')[1] || '';
    const hashPart = queryString.split('#');
    params = new URLSearchParams(hashPart[0]);
    hashParams = new URLSearchParams(hashPart[1] || '');
  } else {
    const urlObj = new URL(url);
    params = urlObj.searchParams;
    hashParams = new URLSearchParams(urlObj.hash.substring(1));
  }

  // Check for implicit flow tokens (access_token in hash or query)
  const accessToken = hashParams.get('access_token') || params.get('access_token');
  const refreshToken = hashParams.get('refresh_token') || params.get('refresh_token');
  
  if (accessToken && refreshToken) {
    // Implicit flow: set session directly
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    // ... handle result ...
  }

  // PKCE flow fallback: extract code and exchange
  const code = params.get('code') || hashParams.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    // ... handle result ...
  }
}
```

#### 4. `src/hooks/useDeepLink.ts`
- No changes needed -- it already calls `completeOAuth()` which will be fixed.

#### 5. `src/pages/AuthCallback.tsx`
- No changes needed -- it already calls `completeOAuth()` which will be fixed.

---

### Why Implicit Flow?

| Aspect | PKCE (current, broken) | Implicit (proposed fix) |
|---|---|---|
| Code verifier | Stored in WebView localStorage, inaccessible from external browser | Not needed |
| Token delivery | Auth code in query param, needs exchange | Tokens directly in URL fragment |
| Security | More secure for web apps | Acceptable for native apps with custom schemes |
| Complexity | Requires matching code verifier across contexts | Simpler -- tokens are self-contained |

### External Configuration
- **No changes needed** in your external Supabase project. The `onetap://auth-callback` redirect URL you already added will work with implicit flow too.

### Summary of File Changes

| File | Change |
|---|---|
| `src/lib/supabaseClient.ts` | Add `flowType: 'implicit'` |
| `src/lib/oauthCompletion.ts` | Rewrite `completeOAuth` to handle implicit tokens via `setSession`, fix PKCE fallback to pass just the code, update `isOAuthCallback` to detect `access_token` |

