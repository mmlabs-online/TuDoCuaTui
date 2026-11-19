// Test-only auth objects (not in the image).
import type { IncomingMessage } from "node:http";
import { toUserId, type UserId } from "../user.js";

export const OWNER_A = toUserId("11111111-1111-4111-8111-111111111111") as UserId;
export const OWNER_B = toUserId("22222222-2222-4222-8222-222222222222") as UserId;
export const OWNER_C = toUserId("33333333-3333-4333-8333-333333333333") as UserId;

export function fixedAuth(userId: UserId, email: string | null = null) {
  return { authenticate: async () => ({ ok: true as const, userId, email }) };
}

/** `x-test-user: a|b|c` picks the user (default A). */
export function headerAuth() {
  return {
    authenticate: async (req: IncomingMessage) => ({
      ok: true as const,
      email: null,
      userId:
        req.headers["x-test-user"] === "b"
          ? OWNER_B
          : req.headers["x-test-user"] === "c"
            ? OWNER_C
            : OWNER_A,
    }),
  };
}
