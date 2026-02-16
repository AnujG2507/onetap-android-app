/**
 * Custom Supabase Client - Points to external Supabase project
 * 
 * This wrapper overrides the auto-generated client to connect
 * to the external project (xfnugumyjhnctmqgiyqm).
 * 
 * The anon key is a publishable key (safe in client code).
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabaseTypes';

const EXTERNAL_SUPABASE_URL = 'https://xfnugumyjhnctmqgiyqm.supabase.co';
const EXTERNAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmbnVndW15amhuY3RtcWdpeXFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNzMyMDIsImV4cCI6MjA4NTk0OTIwMn0.X5RDFg-whb-vAqf9gcUN6YNwGed9NaBS6tCT9ne4mKI';

export const supabase = createClient<Database>(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
