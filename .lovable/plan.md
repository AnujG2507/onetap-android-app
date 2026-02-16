

## Update Code to Point to External Supabase Project

Now that steps 1-3 are complete, here are the code changes needed to connect this app to your external Supabase project (`xfnugumyjhnctmqgiyqm`).

### Changes

**1. `src/hooks/useAuth.ts` (line 12)**
Update the auth storage key:
```text
Before: sb-qyokhlaexuywzuyasqxo-auth-token
After:  sb-xfnugumyjhnctmqgiyqm-auth-token
```

**2. `src/pages/AuthCallback.tsx` (line 12)**
Same storage key update:
```text
Before: sb-qyokhlaexuywzuyasqxo-auth-token
After:  sb-xfnugumyjhnctmqgiyqm-auth-token
```

**3. `.env`**
Update environment variables:
```text
VITE_SUPABASE_PROJECT_ID="xfnugumyjhnctmqgiyqm"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmbnVndW15amhuY3RtcWdpeXFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNzMyMDIsImV4cCI6MjA4NTk0OTIwMn0.X5RDFg-whb-vAqf9gcUN6YNwGed9NaBS6tCT9ne4mKI"
VITE_SUPABASE_URL="https://xfnugumyjhnctmqgiyqm.supabase.co"
```

**4. `supabase/config.toml`**
```text
Before: project_id = "qyokhlaexuywzuyasqxo"
After:  project_id = "xfnugumyjhnctmqgiyqm"
```

Note: The Supabase client file (`src/integrations/supabase/client.ts`) reads from environment variables so it will automatically pick up the new values without any code change.

### After Approval

Once these changes are applied, the app will authenticate and sync data against your external Supabase project. You should test the Google sign-in flow end to end to confirm everything is wired correctly.

