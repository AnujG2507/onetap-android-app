

## Update Documentation to Reflect Custom Supabase Client Migration

After migrating from the auto-generated Supabase integration files to a custom client (`src/lib/supabaseClient.ts` + `src/lib/supabaseTypes.ts`), several documentation files contain outdated or misleading references. Here are all the changes needed.

---

### 1. README.md

**Changes:**

- **Line 74**: Remove "No Lovable Cloud dependencies" from the "What This Repository Does NOT Contain" list (Lovable Cloud is connected, even if not relied upon)
- **Lines 85-86**: Replace references to `src/integrations/supabase/client.ts` and `src/integrations/supabase/types.ts` in the "Do Not Touch" table with:
  - `src/lib/supabaseClient.ts` -- Custom Supabase client with hardcoded external project credentials
  - `src/lib/supabaseTypes.ts` -- Database type definitions (manually maintained)
- **Line 87**: Update `.env` entry to note it is system-managed by Lovable Cloud and not used by the app (the custom client bypasses it)

---

### 2. ARCHITECTURE.md

**Changes:**

- **Line 356**: Change `src/integrations/supabase/` description from "AUTO-GENERATED -- do not edit" to reference the new locations:
  - Replace with `src/lib/supabaseClient.ts` and `src/lib/supabaseTypes.ts` as the Supabase connection files
  - Remove the `integrations/supabase/` line from the project structure tree

---

### 3. SUPABASE.md

**Changes:**

- **Section 3 (Supabase Project Setup)**: Update Step 2 to note that environment variables in `.env` are system-managed and not used by the app. The app connects via hardcoded credentials in `src/lib/supabaseClient.ts`. If changing Supabase projects, update that file directly.
- **Section 7 (Edge Functions)**: Add note that edge functions are deployed to the external Supabase project (`xfnugumyjhnctmqgiyqm`), not the Lovable Cloud project.
- **Section 10 (What NOT to Change)**: Replace references to `src/integrations/supabase/client.ts` and `types.ts` with `src/lib/supabaseClient.ts` and `src/lib/supabaseTypes.ts`. Update the descriptions accordingly (these are now manually maintained, not auto-generated).

---

### 4. APP_SUMMARY.md

**Changes:**

- **Lines 52-55 (Backend section)**: Add `cloud_scheduled_actions` to the tables list (it's missing -- only `cloud_bookmarks` and `cloud_trash` are listed).
- **Auth section**: Add a note that the Supabase client is configured in `src/lib/supabaseClient.ts` with hardcoded credentials pointing to the external project.

---

### 5. DEPLOYMENT.md

**Changes:**

- **Section 13 (Supabase Environment Setup)**: Update to clarify that the `.env` file is system-managed by Lovable Cloud and not used by the app. The actual Supabase connection is configured in `src/lib/supabaseClient.ts`. If deploying to a new Supabase project, update that file.
- **Section 11 (Edge Functions Deployment)**: Update `supabase link --project-ref YOUR_PROJECT_ID` to note the current external project ID is `xfnugumyjhnctmqgiyqm`.

---

### 6. ANDROID_SETUP.md

**Changes:**

- **Lines 126-128 (OAuth Setup, Step 1)**: Remove the reference to "Supabase dashboard" URL. Replace with a generic instruction to configure the redirect URL in the Supabase project's Authentication settings.
- **Line 131-134 (Environment Variable)**: Add note that `VITE_PRODUCTION_DOMAIN` should be set in `.env`, but the Supabase connection itself is configured in `src/lib/supabaseClient.ts`, not via environment variables.

---

### Summary of Outdated References

| Old Reference | New Reference |
|---|---|
| `src/integrations/supabase/client.ts` | `src/lib/supabaseClient.ts` |
| `src/integrations/supabase/types.ts` | `src/lib/supabaseTypes.ts` |
| `src/integrations/supabase/` (directory) | Deleted -- files now in `src/lib/` |
| `.env` for Supabase credentials | Credentials hardcoded in `src/lib/supabaseClient.ts` |

No changes needed for: PRODUCT_IDEOLOGY.md, RELEASE_PROCESS.md, PLAY_STORE_CHECKLIST.md, LANGUAGE_SUPPORT_REENABLE.md, UBUNTU_SETUP.md.

