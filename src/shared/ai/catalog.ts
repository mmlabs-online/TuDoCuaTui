// Source of truth: src/shared/ai; mirrored by server/ai/*.js; server/ai/parity.test.ts enforces equality.

export const AI_PROVIDERS = ["claude", "gemini"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export interface AiModel {
  id: string;
  label: string;
  isDefault: boolean;
}

/**
 * Allowlist of models per provider. Gemini is intentionally empty until its ids are verified against
 * Google's docs (T-009 note, 2026-11-10); with no models, Gemini cannot be selected or saved.
 */
export const AI_MODELS: Record<AiProvider, readonly AiModel[]> = {
  claude: [
    { id: "claude-opus-5-5", label: "Claude Opus 5.5", isDefault: false },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", isDefault: false },
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", isDefault: true },
  ],
  gemini: [],
};

export const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;

/** Settings as the browser sees them. The key itself is never part of it. */
export interface AiSettingsView {
  provider: AiProvider;
  model: string;
  keyHint: string | null;
  hasKey: boolean;
  modelSupported: boolean;
  updatedAt: string;
}

export function defaultModelOf(provider: AiProvider): string | null {
  return AI_MODELS[provider].find((m) => m.isDefault)?.id ?? null;
}
