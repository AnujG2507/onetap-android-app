

## Security Fixes Plan (External Supabase Only)

### Context

All edge functions and database tables live on the **external Supabase project** (`xfnugumyjhnctmqgiyqm`). Edge functions are deployed via `npx supabase functions deploy` to that project. Lovable Cloud is not involved in any of these changes.

The app client connects via `src/lib/supabaseClient.ts` which points to the external project. The `supabase.functions.invoke()` calls in hooks like `useUrlMetadata.ts` go to the external project's edge function endpoints.

---

### Fix 1: SSRF Protection + Authentication in `fetch-url-metadata`

**File:** `supabase/functions/fetch-url-metadata/index.ts`

**What changes:**

1. Add a `validateUrl()` function that:
   - Rejects non-HTTP/HTTPS schemes
   - Parses the hostname and blocks private/internal IP ranges: `127.x`, `10.x`, `172.16-31.x`, `192.168.x`, `169.254.x`, `::1`, `0.0.0.0`
   - Blocks known cloud metadata hostnames (`metadata.google.internal`)
   - Called before the `fetch(url, ...)` on line 104; returns 400 if validation fails

2. Add JWT authentication:
   - Extract `Authorization: Bearer <token>` header
   - Create a Supabase client using `Deno.env.get('SUPABASE_URL')` and `Deno.env.get('SUPABASE_ANON_KEY')` (these are auto-set on the external project where the function is deployed)
   - Call `auth.getUser()` to validate the token
   - Return 401 if missing or invalid
   - This works because `useUrlMetadata.ts` already calls `supabase.functions.invoke()` which automatically includes the user's JWT

3. Add CORS origin restriction (see Fix 3 below)

4. Import `createClient` from `https://esm.sh/@supabase/supabase-js@2` (same as `delete-account`)

**No client-side changes needed** -- `supabase.functions.invoke()` already sends the Authorization header automatically when the user is signed in.

---

### Fix 2: XSS Sanitization in TextViewer

**File:** `src/pages/TextViewer.tsx`

**What changes:**

Add an `escapeHtml()` helper function before `renderMarkdown()`:

```typescript
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

In `renderMarkdown()`, apply `escapeHtml()` to each line **before** the markdown regex replacements (line 50). This ensures:
- User-injected `<script>`, `<img onerror=...>` etc. become harmless escaped text
- The regex-generated `<code>`, `<strong>`, `<em>` tags still render correctly since they are added after escaping

Also escape content in heading lines (lines 38, 41, 44) by wrapping the sliced text in `escapeHtml()` and using `dangerouslySetInnerHTML` consistently, or alternatively rendering headings with escaped text as children (simpler approach -- headings don't need inline formatting, so plain text children are fine; just apply `escapeHtml()` to the text).

---

### Fix 3: CORS Origin Restriction on Both Edge Functions

**Files:** `supabase/functions/fetch-url-metadata/index.ts`, `supabase/functions/delete-account/index.ts`

**What changes:**

Replace hardcoded `'Access-Control-Allow-Origin': '*'` with a dynamic origin check:

```typescript
const ALLOWED_ORIGINS = [
  'capacitor://localhost',   // Android app
  'http://localhost',        // Local dev (any port)
  'https://onetapapp.in',   // Production domain
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
```

Both functions get this helper inlined (edge functions don't share imports easily). Every `Response` object uses `getCorsHeaders(req)` instead of the static `corsHeaders` object.

---

### Fix 4: External RLS Verification Checklist in SUPABASE.md

**File:** `SUPABASE.md`

**What changes:**

Add a new section "Security Verification Checklist" after Section 10 that documents:
- All 5 tables must have RLS enabled
- Each table needs 4 policies (SELECT/INSERT/UPDATE/DELETE) with `auth.uid() = user_id`
- Verification SQL queries to run in the external project's SQL editor
- A note that this should be checked after any schema migration

---

### Summary

| Fix | File | Deployed Where |
|-----|------|---------------|
| SSRF + Auth | `supabase/functions/fetch-url-metadata/index.ts` | External Supabase via CLI |
| XSS escape | `src/pages/TextViewer.tsx` | Client bundle |
| CORS restriction | Both edge function files | External Supabase via CLI |
| RLS checklist | `SUPABASE.md` | Documentation only |

### Implementation Order

1. `supabase/functions/fetch-url-metadata/index.ts` -- SSRF validation, JWT auth, CORS (all in one pass)
2. `supabase/functions/delete-account/index.ts` -- CORS restriction only
3. `src/pages/TextViewer.tsx` -- HTML escaping
4. `SUPABASE.md` -- RLS verification checklist

### Deployment Note

After code changes, edge functions must be redeployed to the external project:
```bash
npx supabase functions deploy fetch-url-metadata --project-ref xfnugumyjhnctmqgiyqm
npx supabase functions deploy delete-account --project-ref xfnugumyjhnctmqgiyqm --no-verify-jwt
```

