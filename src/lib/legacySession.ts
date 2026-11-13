// Removes auth tokens left by the old Supabase build (sb-<project-ref>-auth-token[-code-verifier]). The Supabase
// project was shared with stoktok (D17), so the token is a stoktok credential. Remove this file after a few releases.
const LEGACY = /^sb-[^\s]+-auth-token(-code-verifier)?$/;

export function clearLegacyAuthKeys(
  storage?: Pick<Storage, "length" | "key" | "removeItem">,
): number {
  try {
    // Resolved inside try: reading window.localStorage throws when the browser blocks site data.
    const s = storage ?? localStorage;
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && LEGACY.test(k)) keys.push(k);
    }
    keys.forEach((k) => s.removeItem(k));
    return keys.length;
  } catch {
    return 0;
  }
}
