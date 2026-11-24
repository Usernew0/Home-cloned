export type LinkTenant = { coupleId?: string; partner1: string; partner2?: string };
export type LinkUser = { id?: string; username: string; coupleId?: string };
const norm = (v?: string) => (v || "").toLowerCase().trim();

/**
 * Which tenant a user card belongs to. The user's own coupleId wins. Name matching is only a fallback,
 * and a tenant with both partners beats a stale one-person tenant that happens to list the same name first.
 */
export function findTenantForUser<T extends LinkTenant>(user: LinkUser, tenants: T[]): T | undefined {
  if (user.coupleId) {
    const byId = tenants.find((t) => t.coupleId === user.coupleId);
    if (byId) return byId;
  }
  const name = norm(user.username);
  // A tenant that carries a different explicit couple id than the user is a different space: never match it by name.
  const byName = tenants.filter(
    (t) =>
      (norm(t.partner1) === name || (t.partner2 && norm(t.partner2) === name)) &&
      (!user.coupleId || !t.coupleId || t.coupleId === user.coupleId),
  );
  return byName.find((t) => t.partner1 && t.partner2) || byName[0];
}

/** The other person in the user's couple, or undefined when genuinely unlinked. */
export function partnerNameFor(user: LinkUser, users: LinkUser[], tenants: LinkTenant[]): string | undefined {
  const tenant = findTenantForUser(user, tenants);
  const name = norm(user.username);
  if (tenant) {
    const other = norm(tenant.partner1) === name ? tenant.partner2 : tenant.partner1;
    if (other && norm(other) !== name) return other;
  }
  if (user.coupleId) return users.find((u) => u.id !== user.id && norm(u.username) !== name && u.coupleId === user.coupleId)?.username;
  return undefined;
}

/** True when at least one account currently points at this space. Not-in-use spaces are kept, only labelled differently. */
export function isTenantInUse(tenant: LinkTenant, users: LinkUser[]): boolean {
  return !!tenant.coupleId && users.some((u) => u.coupleId === tenant.coupleId);
}

/**
 * Factual label only: no loaded account currently has this coupleId. Never claims the space is unused or empty of data.
 * Returns false while accounts are still loading (cache only) or the list is empty.
 */
export function isSpaceUnlinked(tenant: LinkTenant, users: LinkUser[], accountsLoaded: boolean): boolean {
  return accountsLoaded && users.length > 0 && !isTenantInUse(tenant, users);
}

/**
 * Which accounts an Unlink on this space may change: only accounts whose coupleId IS this space.
 * Never match by name (a leftover solo row shares a name with an account that lives in another space).
 * No linked accounts means there is nothing to unlink, so the caller must not delete the record either.
 */
export function unlinkTargets<U extends LinkUser>(tenant: LinkTenant, users: U[]): { users: U[]; canUnlink: boolean } {
  const targets = tenant.coupleId ? users.filter((u) => u.coupleId === tenant.coupleId) : [];
  return { users: targets, canUnlink: targets.length > 0 };
}
