# The website and the docs — a static export (out/), served by Caddy.
#
#   docker build -f apps/web/site/Dockerfile -t henglosio/site .
#   docker run -p 3000:3000 henglosio/site

FROM node:24-bookworm-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
	NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# Dependencies first — their layer stays cached until the lockfile changes.
# Only downloaded here: the native builds run in the install, for what the app uses.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --config.ignore-scripts=true

COPY . .
RUN pnpm install --offline --frozen-lockfile --filter "site..."
RUN pnpm --filter "site..." run build


FROM caddy:2-alpine
COPY --from=build /repo/apps/web/site/out /srv
# /docs/concepts → /docs/concepts.html, as the export writes it.
RUN printf ':3000 {\n\troot * /srv\n\tencode gzip\n\ttry_files {path} {path}.html {path}/index.html\n\tfile_server\n\thandle_errors {\n\t\trewrite * /404.html\n\t\tfile_server\n\t}\n}\n' > /etc/caddy/Caddyfile
EXPOSE 3000
