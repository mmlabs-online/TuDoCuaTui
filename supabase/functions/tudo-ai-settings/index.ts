// Deno-only shell. All logic is in ../_shared/core/settingsHandler.ts (unit-tested in Vitest).
// Secrets (names only): TUDO_AI_KEK, TUDO_ALLOWED_ORIGINS. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are injected by the Edge runtime.
import { createClient } from "@supabase/supabase-js";
import { testClaudeKey } from "../_shared/deno/claude.ts";
import { testGeminiKey } from "../_shared/core/gemini.ts";
import { handleSettingsRequest } from "../_shared/core/settingsHandler.ts";
import { createAiStore, type DbClient } from "../_shared/core/store.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const store = createAiStore(admin as unknown as DbClient);

Deno.serve((req) =>
  handleSettingsRequest(req, {
    env: { kek: Deno.env.get("TUDO_AI_KEK"), origins: Deno.env.get("TUDO_ALLOWED_ORIGINS") },
    // Rejects anon-key tokens and deleted users.
    getUserId: async (token) => {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    store,
    testClaude: testClaudeKey,
    testGemini: (key, model) => testGeminiKey(fetch, key, model),
    now: () => new Date(),
    // Entry type allows only {action, code, providerStatus?}; nothing else is ever logged.
    log: (entry) => console.log(JSON.stringify(entry)),
  }),
);
