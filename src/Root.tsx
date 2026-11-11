import App from "./App";
import type { DataMode } from "./data/mode";
import { AuthGate } from "./features/auth/AuthGate";

/** Login only in Supabase mode; API mode is protected by Cloudflare Access. */
export function Root({ mode }: { mode: DataMode }) {
  return mode === "supabase" ? (
    <AuthGate>
      <App mode={mode} />
    </AuthGate>
  ) : (
    <App mode={mode} />
  );
}
