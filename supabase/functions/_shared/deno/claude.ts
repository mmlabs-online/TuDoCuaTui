// Deno-only. Cheap key check with the official Anthropic SDK: retrieving a model costs no tokens.
import Anthropic from "@anthropic-ai/sdk";
import { mapClaudeError, type TestResult } from "../core/providerErrors.ts";

export async function testClaudeKey(key: string, model: string): Promise<TestResult> {
  try {
    const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 10_000 });
    await client.models.retrieve(model);
    return { ok: true };
  } catch (e) {
    // Only the HTTP status is read; the SDK error object and its message are never logged or returned.
    const status = (e as { status?: unknown } | null)?.status;
    const code = typeof status === "number" ? status : undefined;
    return {
      ok: false,
      code: mapClaudeError(code),
      ...(code === undefined ? {} : { status: code }),
    };
  }
}
