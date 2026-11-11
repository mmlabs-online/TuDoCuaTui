import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Fixed time zone so day-boundary tests behave the same on every machine and in CI.
process.env.TZ = "Asia/Ho_Chi_Minh";

const thresholds = { lines: 80, statements: 80, functions: 80, branches: 75 };

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src") },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    globals: false,
    restoreMocks: true,
    // Force local mode even if a developer has a .env.local.
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "", VITE_APP_VERSION: "" },
    coverage: {
      provider: "v8",
      include: [
        "src/data/**",
        "src/features/items/filters.ts",
        "src/features/items/validate.ts",
        "src/features/items/dirty.ts",
        "src/lib/text.ts",
        "src/lib/version.ts",
        "src/features/auth/authMessages.ts",
        "src/features/import-export/csv/parse.ts",
        "src/features/import-export/csv/map.ts",
        "src/features/import-export/csv/preview.ts",
        "src/features/import-export/download.ts",
        "src/shared/ai/**",
        "supabase/functions/_shared/core/**",
        "server/**/*.js",
      ],
      exclude: ["src/data/photos.ts", "**/*.test.*"],
      reporter: ["text", "html"],
      thresholds: {
        "src/data/**": thresholds,
        "src/features/items/filters.ts": thresholds,
        "src/features/items/validate.ts": thresholds,
        "src/features/items/dirty.ts": thresholds,
        "src/lib/text.ts": thresholds,
        "src/lib/version.ts": thresholds,
        "src/features/auth/authMessages.ts": thresholds,
        "src/features/import-export/csv/parse.ts": thresholds,
        "src/features/import-export/csv/map.ts": thresholds,
        "src/features/import-export/csv/preview.ts": thresholds,
        "src/features/import-export/download.ts": thresholds,
        "src/shared/ai/**": thresholds,
        "supabase/functions/_shared/core/**": thresholds,
        "server/static.js": thresholds,
        "server/access.js": thresholds,
        "server/http.js": thresholds,
        "server/validate.js": thresholds,
        "server/errors.js": thresholds,
        "server/drive.js": thresholds,
        "server/drive-smoke.js": thresholds,
      },
    },
  },
});
