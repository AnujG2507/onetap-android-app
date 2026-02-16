

## Fix: Android App Not Opening After OAuth Sign-In

### Root Cause

After Google sign-in, the browser navigates to `https://onetapapp.in/auth-callback?code=...`. Android App Links should intercept this and open the app, but verification is failing. The browser loads a web page instead, showing "Redirecting to OneTap" (from whatever is hosted at onetapapp.in).

App Links verification requires:
- `https://onetapapp.in/.well-known/assetlinks.json` must be served with correct content and `Content-Type: application/json`
- DNS and hosting must be properly configured
- Android caches verification results — even after fixing, it can take time to propagate

### Solution: Dual Approach (Custom Scheme Fallback + Intent URL Redirect)

Since App Links are unreliable, we add a custom URL scheme as a guaranteed fallback, and modify the auth-callback web page to attempt opening the app via an Android Intent URL.

---

### Step 1: Add Custom Scheme Intent Filter to AndroidManifest.xml

Add a second intent filter for `onetap://auth-callback` alongside the existing App Link. Custom schemes don't require verification and always work.

```xml
<!-- Custom scheme fallback for OAuth callback -->
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="onetap" android:host="auth-callback" />
</intent-filter>
```

---

### Step 2: Update `getOAuthRedirectUrl()` in `src/lib/oauthCompletion.ts`

For native platforms, change the redirect URL to use the custom scheme instead of the HTTPS domain:

```typescript
// For native, use custom scheme that reliably triggers deep link
return 'onetap://auth-callback';
```

This ensures Supabase redirects to `onetap://auth-callback?code=...` which Android will always intercept and open the app.

---

### Step 3: Update `isOAuthCallback()` in `src/lib/oauthCompletion.ts`

Update the check to also recognize the custom scheme:

```typescript
export function isOAuthCallback(url: string): boolean {
  try {
    return (url.includes('/auth-callback') || url.includes('onetap://auth-callback')) && 
           (url.includes('code=') || url.includes('error='));
  } catch {
    return false;
  }
}
```

---

### Step 4: Handle Code Exchange for Custom Scheme URLs

The `completeOAuth` function calls `supabase.auth.exchangeCodeForSession(url)`. With a custom scheme URL like `onetap://auth-callback?code=xxx`, Supabase may not parse it correctly. We need to extract the code and pass just the code, or convert it to a proper URL format:

```typescript
// In completeOAuth, before calling exchangeCodeForSession:
// If URL uses custom scheme, extract params and reconstruct as HTTPS URL
let processableUrl = url;
if (url.startsWith('onetap://')) {
  const urlParams = url.split('?')[1] || '';
  processableUrl = `https://placeholder/auth-callback?${urlParams}`;
}
```

---

### Step 5: Add `onetap://auth-callback` to Supabase Redirect URLs

**External configuration required (in your Supabase dashboard):**

Add `onetap://auth-callback` to the **Redirect URLs** allowlist in Authentication > URL Configuration. Without this, Supabase will reject the redirect.

---

### Summary of Changes

| File | Change |
|---|---|
| `native/android/.../AndroidManifest.xml` | Add custom scheme intent filter for `onetap://auth-callback` |
| `src/lib/oauthCompletion.ts` | Change native redirect URL to `onetap://auth-callback`, update `isOAuthCallback()`, handle custom scheme in `completeOAuth()` |

### External Configuration Required
- Add `onetap://auth-callback` to Supabase Authentication > Redirect URLs

