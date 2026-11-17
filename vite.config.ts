import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

import { devTokenProxy } from "./dev/devTokenProxy";

// Bound to loopback only: the dev proxy adds a real token, so the dev server must not be reachable from the LAN.
const host = "127.0.0.1";
const port = Number(process.env.TUDO_DEV_PORT || 8443);

// Vite config — https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), devTokenProxy()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: { host, port, strictPort: true },
  // `pnpm preview` never proxies: no token injection outside `pnpm dev`.
  preview: { host, port, proxy: {} },
});
