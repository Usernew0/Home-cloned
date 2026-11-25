/** Pure helpers for the personal/joint data spaces. New items are private by default: they are stamped with the account's personal space
 *  when it is known. Items from the current joint space (legacy rows) stay visible read-only. Shared items arrive through a separate server read. */
export function stampSpaceId(currentCoupleId: string, personalCoupleId?: string | null): string {
  return personalCoupleId && personalCoupleId.trim() ? personalCoupleId.trim() : currentCoupleId;
}

export type SpaceKind = "mine" | "together" | "other";

export function classifySpace(itemCoupleId: string | undefined | null, currentCoupleId: string, personalCoupleId?: string | null): SpaceKind {
  const id = (itemCoupleId || "").trim();
  if (!id) return "other";
  if (personalCoupleId && id === personalCoupleId.trim()) return "mine";
  if (id === (currentCoupleId || "").trim()) return personalCoupleId && personalCoupleId.trim() === id ? "mine" : "together";
  return "other";
}

export function isInMySpaces(itemCoupleId: string | undefined | null, currentCoupleId: string, personalCoupleId?: string | null): boolean {
  return classifySpace(itemCoupleId, currentCoupleId, personalCoupleId) !== "other";
}
