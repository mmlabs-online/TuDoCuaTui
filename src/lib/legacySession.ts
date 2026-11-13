// Removes auth tokens left by the old Supabase build (sb-<project-ref>-auth-token[-code-verifier]). The Supabase
// project was shared with stoktok (D17), so the token is a stoktok credential. Remove this file after a few releases.
const LEGACY = /^sb-[^\s]+-auth-token(-code-verifier)?$/;

export function clearLegacyAuthKeys(
  storage: Pick<Storage, "length" | "key" | "removeItem"> = localStorage,
): number {
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && LEGACY.test(k)) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
    return keys.length;
  } catch {
    return 0;
  }
}
