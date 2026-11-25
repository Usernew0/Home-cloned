import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders } from "./authHeaders";
import { mapFromDb } from "./supabaseService";
import type { ShareableTable } from "./membershipClient";

/** Items my partner chose to share with me. Read from the server (authoritative Supabase rows, filtered to the granting owner's personal space).
 *  They are never merged into my own lists or caches, never edited here, and carry sharedFromPartner so the UI can show them read-only. */
export type SharedMap = Record<ShareableTable, any[]>;
const EMPTY: SharedMap = { milestones: [], date_plans: [], memories: [], letters: [], couple_questions: [], celebration_cards: [] };
const TABLES = Object.keys(EMPTY) as ShareableTable[];

export async function fetchSharedItems(table: ShareableTable): Promise<any[]> {
  try {
    const r = await fetch("/api/proxy", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ table, action: "select", space: "shared" }) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j?.success === false || !Array.isArray(j?.data)) return [];
    return j.data.map((row: any) => ({ ...mapFromDb<any>(row), sharedFromPartner: true }));
  } catch {
    return [];
  }
}

/** Loads shared items for every shareable table. refresh() re-reads after a share or unshare. Safe to call when sharing is not enabled (returns empty lists). */
export function useSharedItems(enabled: boolean): { shared: SharedMap; refresh: () => void } {
  const [shared, setShared] = useState<SharedMap>(EMPTY);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!enabled) { setShared(EMPTY); return; }
    const entries = await Promise.all(TABLES.map(async (t) => [t, await fetchSharedItems(t)] as const));
    if (alive.current) setShared(Object.fromEntries(entries) as SharedMap);
  }, [enabled]);
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, [load]);
  return { shared, refresh: () => { void load(); } };
}
