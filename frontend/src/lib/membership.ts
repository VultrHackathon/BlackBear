/**
 * Membership matching. Config lists clubs as "Stammis (Apotek Hjärtat)" while promos
 * say requires_membership: "Stammis". The parenthesised store name is ignored.
 */

export function membershipName(value: string): string {
  return value.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function key(value: string): string {
  return membershipName(value).toLocaleLowerCase("sv-SE");
}

export function hasMembership(
  memberships: readonly string[],
  required: string | null | undefined,
): boolean {
  if (!required) return false;
  const wanted = key(required);
  return memberships.some((m) => key(m) === wanted);
}
