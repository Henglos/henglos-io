# The studio — Next.js, as a standalone server.
#
#   docker build -f apps/web/app/Dockerfile -t henglosio/studio .
#   docker run -p 5173:5173 henglosio/studio
#
# It calls the hosting on its own origin (/io/api, /io/collab): put both behind
# one address — the Caddyfile, or an Ingress — with /io/* going to the hosting.

FROM node:24-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
	NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo


FROM base AS build
# Dependencies first — their layer stays cached until the lockfile changes.
# Only downloaded here: the native builds run in the install, for what the app uses.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --config.ignore-scripts=true

COPY . .
RUN pnpm install --offline --frozen-lockfile --filter "app..."
RUN pnpm --filter "app..." run build


FROM node:24-bookworm-slim
ENV NODE_ENV=production \
	NEXT_TELEMETRY_DISABLED=1 \
	HOSTNAME=0.0.0.0 \
	PORT=5173
WORKDIR /app

# The standalone server keeps the monorepo's layout: the app sits in apps/web/app.
COPY --from=build --chown=node:node /repo/apps/web/app/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/app/.next/static ./apps/web/app/.next/static
COPY --from=build --chown=node:node /repo/apps/web/app/public ./apps/web/app/public

USER node
EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
	CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT).then(r => process.exit(r.status < 500 ? 0 : 1), () => process.exit(1))"

CMD ["node", "apps/web/app/server.js"]
