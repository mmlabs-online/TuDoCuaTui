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
    env: { VITE_APP_VERSION: "" },
    coverage: {
      provider: "v8",
      include: [
        "src/data/**",
        "src/features/items/filters.ts",
        "src/features/items/validate.ts",
        "src/features/items/dirty.ts",
        "src/lib/text.ts",
        "src/lib/version.ts",
        "src/lib/legacySession.ts",
        "src/features/import-export/csv/parse.ts",
        "src/features/import-export/csv/map.ts",
        "src/features/import-export/csv/preview.ts",
        "src/features/import-export/download.ts",
        "src/shared/ai/**",
        "server/**/*.js",
        "scripts/drive-connect.mjs",
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
        "src/lib/legacySession.ts": thresholds,
        "src/features/import-export/csv/parse.ts": thresholds,
        "src/features/import-export/csv/map.ts": thresholds,
        "src/features/import-export/csv/preview.ts": thresholds,
        "src/features/import-export/download.ts": thresholds,
        "src/shared/ai/**": thresholds,
        "server/static.js": thresholds,
        "server/access.js": thresholds,
        "server/http.js": thresholds,
        "server/validate.js": thresholds,
        "server/errors.js": thresholds,
        "server/drive.js": thresholds,
        "server/ai/**": thresholds,
        "server/drive-smoke.js": thresholds,
        "scripts/drive-connect.mjs": thresholds,
      },
    },
  },
});
