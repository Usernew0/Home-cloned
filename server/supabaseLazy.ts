import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveServerSupabaseKey } from "./serverKey.js";

let client: SupabaseClient | null = null;

/** Created on first use so a missing env var fails the request, not the module import (and every cold start). */
export function getServiceSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = resolveServerSupabaseKey();
    if (!url || !key) throw new Error("Supabase is not configured");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  return client;
}

export const lazySupabase: any = new Proxy({}, { get: (_t, prop) => (getServiceSupabase() as any)[prop] });
