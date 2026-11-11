# T-015 (D23/D26): the SPA build plus the Node server (server/) on :3000, non-root. The server serves dist/ and
# /api; no ports published: cloudflared reaches it as `tudocuatui` on the external network.
# Runtime config comes only from outside: DATABASE_URL from the host env file, CF_ACCESS_* from the compose file.
# None of them (and never TUDO_ACCESS_DISABLED) is set here (R3).
# VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are still build args until T-016; both are public by design (R3).
# VITE_APP_VERSION (T-008) is the release tag vX.Y.Z (public, not a secret); empty shows "dev".
# Never set FIGMA_PUBLIC_URL: it changes Vite's `base`.

FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
# Build args live in this stage only: no ENV, so nothing lands in the runtime image config or history.
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ARG VITE_APP_VERSION=
RUN v="$VITE_APP_VERSION"; \
    [ -z "$v" ] || { [ -z "$(printf '%s' "$v" | tr -d '0-9.v')" ] \
      && [ "$(printf '%s\n' "$v" | wc -l)" = 1 ] \
      && printf '%s\n' "$v" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; } \
    || { echo "VITE_APP_VERSION must be empty or vX.Y.Z" >&2; exit 1; }
RUN pnpm build && printf '%s\n' "${VITE_APP_VERSION:-dev}" > dist/version.txt

# Production dependencies only (pure JS, so BUILDPLATFORM is safe).
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS prod-deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# Files stay root-owned: the app cannot rewrite itself. .dockerignore drops server/test and *.test.ts.
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server
COPY db/migrations ./db/migrations
USER node
EXPOSE 3000
# Liveness only; the compose file overrides this with /readyz (database included).
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node","-e","fetch('http://127.0.0.1:3000/healthz',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node","server/index.js"]
