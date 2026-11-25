import { getFirebaseScope, ensureFreshScope } from "./firebaseScope";
import { isInMySpaces } from "./space";

/** Direct browser reads return every row RLS allows: own personal rows, legacy joint rows AND rows a partner shared. Only the first two belong in the local cache and the lists.
 *  Shared rows come through the separate shared read. Rows with no couple_id and admin and pre-release sessions (no strict u: pid) pass through unchanged; a strict user session whose personal space is not known yet gets no rows until the scope is refreshed. */
export function filterOwnSpaceRows<T extends { couple_id?: string | null }>(rows: T[], currentCoupleId: string, personalCoupleId: string, strictUser = false): T[] {
  if (!personalCoupleId) return strictUser ? [] : rows; // a strict user session without a known personal space FAILS CLOSED (no rows, no fallback to the current space)
  return rows.filter((r) => !r || !r.couple_id || isInMySpaces(r.couple_id, currentCoupleId, personalCoupleId));
}

export function ownSpaceRows<T extends { couple_id?: string | null }>(rows: T[]): T[] {
  const scope: any = getFirebaseScope();
  // Strict only when the SERVER reports the v2 release active. Gate off: old behavior, unchanged. Gate on without a personal space: fail closed and ask for a fresh sign-in.
  const strictUser = !!scope && scope.membershipV2 === true && scope.role !== "admin";
  if (strictUser && !scope.personalCoupleId && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("membership-relogin-required"));
  return filterOwnSpaceRows(rows, scope?.coupleId || "", scope?.personalCoupleId || "", strictUser);
}

/** Use this at every list read: it refreshes the scope from the server first (once per page load), then filters. */
export async function ownSpaceRowsFresh<T extends { couple_id?: string | null }>(rows: T[]): Promise<T[]> {
  const fresh = await ensureFreshScope();
  const scope: any = getFirebaseScope();
  // Refresh failed and this browser never learned the server's gate (scope stored by an older client): unknown gate fails closed until a refresh succeeds.
  if (!fresh && scope && scope.membershipV2 === undefined && scope.role !== "admin") return [];
  return ownSpaceRows(rows);
}
