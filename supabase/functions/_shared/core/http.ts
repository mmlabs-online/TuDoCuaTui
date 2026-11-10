import { AI_ERROR_STATUS, type AiServerErrorCode } from "../ai/errors.ts";
import { MAX_BODY_BYTES } from "../ai/validate.ts";

export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** CORS headers only for an allowed origin; CORS is not the security control, auth is. */
export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (origin === null || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Error body is exactly `{error:{code}}`. */
export function errorResponse(code: AiServerErrorCode, cors: Record<string, string>): Response {
  return json(AI_ERROR_STATUS[code], { error: { code } }, cors);
}

/** Reads the body as text, refusing anything over the cap. Returns null when too large. */
export async function readLimitedText(req: Request, max = MAX_BODY_BYTES): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  const buf = await req.arrayBuffer();
  if (buf.byteLength > max) return null;
  return new TextDecoder().decode(buf);
}
