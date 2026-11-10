# T-007: static build of the app served by non-root nginx on :3000 (no published ports; cloudflared
# reaches it as `tudocuatui` on the external `web` network).
# VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are build args, baked into the bundle at build time.
# Both are public by design (R3). Without them the image runs in local mode (R1).
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
RUN pnpm build

FROM nginxinc/nginx-unprivileged:1.30-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/ || exit 1
