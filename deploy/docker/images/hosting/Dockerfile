# The hosting — the API (/io/api), the collab socket (/io/collab), the drivers' link.
#
#   docker build -f deploy/docker/images/hosting/Dockerfile -t henglosio/hosting .
#   docker run -p 3333:3333 -v hio-data:/data -e HIO_JWT_SECRET=… henglosio/hosting
#
# The database (SQLite) and the installation's id live in /data — mount a volume there.

FROM node:24-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo


FROM base AS build
# Native modules (better-sqlite3, argon2) build from source when no prebuilt binary fits.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

# Dependencies first — their layer stays cached until the lockfile changes.
# Only downloaded here: the native builds run in the install, for what the app uses.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --config.ignore-scripts=true

COPY . .
RUN pnpm install --offline --frozen-lockfile --filter "hosting..."
RUN pnpm --filter "hosting..." run build

# Only what the hosting runs with: its production dependencies, the workspace
# packages it uses (built), and drizzle-kit, which applies the migrations.
RUN pnpm --filter hosting deploy --prod --legacy /out \
	&& cp -r apps/hosting/dist /out/dist


FROM node:24-bookworm-slim
ENV NODE_ENV=production \
	HIO_HOST=0.0.0.0 \
	HIO_PORT=3333 \
	HIO_DATABASE_PROVIDER=sqlite \
	HIO_DATABASE_URL=file:/data/hio.sqlite \
	HIO_TELEMETRY_ID_FILE=/data/telemetry-id \
	HIO_LOCAL_PACKAGES=/app/local-packages
WORKDIR /app

COPY --from=build --chown=node:node /out .
# The boards, components and platform that come with it (HIO_LOCAL_PACKAGES).
COPY --from=build --chown=node:node /repo/packages/library ./local-packages/library
COPY --from=build --chown=node:node /repo/packages/hio-system/package.json /repo/packages/hio-system/manifest.yaml ./local-packages/hio-system/
RUN mkdir /data && chown node:node /data
VOLUME /data

USER node
EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
	CMD node -e "fetch('http://127.0.0.1:' + process.env.HIO_PORT + '/io/api/v1/auth/setup-status').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# The pending migrations (drizzle/migrations) first, then the server.
CMD ["sh", "-c", "./node_modules/.bin/drizzle-kit migrate && exec node dist/src/main.js"]
