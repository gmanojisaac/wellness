import { createBrowserClient } from '@supabase/ssr';

// Browser client: the session lives in cookies so the proxy can read it too.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
