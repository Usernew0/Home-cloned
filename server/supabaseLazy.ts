import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Created on first use so a missing env var fails the request, not the module import (and every cold start). */
export function getServiceSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase is not configured");
    client = createClient(url, key);
  }
  return client;
}

export const lazySupabase: any = new Proxy({}, { get: (_t, prop) => (getServiceSupabase() as any)[prop] });
