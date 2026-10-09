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
# Bun is the package manager (bun.lock). Pinned to the version CI uses, so the
# image and CI resolve identically.
ARG BUN_IMAGE=dhi.io/bun:1.4.2-alpine-dev

# Named stage so the COPY --from below can take the image from a build arg.
FROM ${BUN_IMAGE} AS bun

FROM ${BUILD_IMAGE} AS build
WORKDIR /app

# The Bun binary from the hardened Bun image, rather than `npm install -g bun`:
# no npm registry round-trip, same supply chain as the base images. It is a musl
# build whose only shared libraries (libstdc++, libgcc_s) Node needs too.
COPY --from=bun /usr/bin/bun /usr/local/bin/bun

# Manifests first so the dependency layer is reused when only source changes.
# bunfig.toml carries the repo's 24h supply-chain guard. The cache mount keeps
# Bun's package cache across builds, so a lockfile change re-downloads only what
# changed instead of all ~470 packages.
COPY package.json bun.lock bunfig.toml ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

COPY . .

ENV NITRO_PRESET=node-server
RUN bun run build

# The migrator, bundled to one plain-Node file (drizzle-orm and pg inlined) so the
# runtime image can run migrations without bun or the TypeScript source. It finds
# its SQL at ./migrations relative to itself, so the folder is copied next to it.
RUN bun build src/server/db/migrate.ts --target=node --outfile=/app/migrate/migrate.mjs \
 && cp -R src/server/db/migrations /app/migrate/migrations


FROM ${RUNTIME_IMAGE} AS runtime
WORKDIR /app

# Server-side secrets (DATABASE_URL, SESSION_SECRET, CRON_SECRET, RAYA_API_KEY, ...) are read from
# the environment at RUNTIME and are never baked into the image.
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Only the build output: Nitro traces its own runtime dependencies into
# .output/server/node_modules, so no node_modules, source or toolchain ships.
COPY --from=build --chown=node:node /app/.output ./.output

# Migrations (SQL + meta/_journal.json) and the bundled migrator, for the
# deployment's migrate Job: `node migrate/migrate.mjs` with DATABASE_URL.
COPY --from=build --chown=node:node /app/migrate ./migrate

# The Node images ship a non-root `node` user (uid 1000).
USER node
EXPOSE 3000

# Node, because the runtime image has no curl or wget. Exec form on purpose: the
# shell form runs under /bin/sh, which the hardened runtime image does not have,
# so every check would fail and the container would report unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", ".output/server/index.mjs"]
