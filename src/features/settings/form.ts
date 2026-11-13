import type { AiSettingsView } from "@/shared/ai/catalog";
import { AI_MODELS, defaultModelOf, type AiProvider } from "@/shared/ai/catalog";
import { isAllowedModel, validateApiKeyFormat } from "@/shared/ai/validate";

export interface SettingsForm {
  provider: AiProvider;
  model: string;
  key: string;
}

export const modelsFor = (provider: AiProvider) => AI_MODELS[provider];

export function nextModelOnProviderChange(provider: AiProvider, current: string): string {
  return isAllowedModel(provider, current) ? current : (defaultModelOf(provider) ?? "");
}

export function initialForm(view: AiSettingsView | null): SettingsForm {
  if (view && view.modelSupported) {
    return { provider: view.provider, model: view.model, key: "" };
  }
  const provider = view?.provider ?? "claude";
  return { provider, model: defaultModelOf(provider) ?? "", key: "" };
}

/** Empty key is fine (keeps the saved one); a non-empty key must pass the server's format check. */
export function keyError(raw: string): "invalid_key_format" | null {
  if (raw === "") return null;
  return validateApiKeyFormat(raw).ok ? null : "invalid_key_format";
}

export function isDirty(form: SettingsForm, saved: AiSettingsView | null): boolean {
  const base = initialForm(saved);
  return form.key.trim() !== "" || form.provider !== base.provider || form.model !== base.model;
}

export function canSave(form: SettingsForm, saved: AiSettingsView | null): boolean {
  if (!isAllowedModel(form.provider, form.model)) return false;
  if (keyError(form.key)) return false;
  if (saved?.hasKey && form.provider !== saved.provider && form.key.trim() === "") return false;
  return isDirty(form, saved) || (saved !== null && !saved.modelSupported);
}

export function canTest(form: SettingsForm, saved: AiSettingsView | null): boolean {
  return !!saved?.hasKey && saved.modelSupported && !isDirty(form, saved);
}
