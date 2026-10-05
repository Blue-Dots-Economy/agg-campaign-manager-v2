# syntax=docker/dockerfile:1

# Container image for the Campaign Manager (TanStack Start + Nitro).
#
# The repo's default build target is a Cloudflare Worker bundle, which cannot run
# in a container. NITRO_PRESET=node-server makes the SAME source build as a plain
# Node server (.output/server/index.mjs). Checked: it builds and answers 200 on
# `/` and `/login` with no secrets and no environment variables set.
#
# Base images are Docker Hardened Images from dhi.io, as in the other service
# repos: the -dev variant (shell, npm) builds, the minimal variant runs. dhi.io
# refuses anonymous pulls, so building this needs `docker login dhi.io`, and any
# CI workflow that builds it needs a dhi.io login step.
ARG BUILD_IMAGE=dhi.io/node:24-alpine-dev
ARG RUNTIME_IMAGE=dhi.io/node:24-alpine

FROM ${BUILD_IMAGE} AS build
WORKDIR /app

# Bun is the package manager (bun.lock). Pinned to the version CI uses, so the
# image and CI resolve identically. Installed through npm to avoid piping an
# installer script into a shell.
RUN npm install --global bun@1.4.2

# Manifests first so the dependency layer is reused when only source changes.
# bunfig.toml carries the repo's 24h supply-chain guard.
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .

# VITE_SUPABASE_* are inlined into the client bundle at build time, and come from
# the tracked .env (see .dockerignore, which deliberately does not exclude it).
# They are publishable-key values meant to ship to browsers, but the key role is
# not verified here. Per-environment values would need build args; not added yet.
ENV NITRO_PRESET=node-server
RUN bun run build


FROM ${RUNTIME_IMAGE} AS runtime
WORKDIR /app

# Server-side secrets (SUPABASE_SERVICE_ROLE_KEY, PURPLE_SUPABASE_SERVICE_ROLE_KEY, RAYA_API_KEY, ...) are read from
# the environment at RUNTIME and are never baked into the image.
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Only the build output: Nitro traces its own runtime dependencies into
# .output/server/node_modules, so no node_modules, source or toolchain ships.
COPY --from=build --chown=node:node /app/.output ./.output

# The Node images ship a non-root `node` user (uid 1000).
USER node
EXPOSE 3000

# Node, because the runtime image has no curl or wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
