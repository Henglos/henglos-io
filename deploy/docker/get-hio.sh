#!/bin/sh
#
# get-henglos.sh — script de configuração e instalação para o henglos-io (Docker Compose + Caddy)
#
set -eu

SCRIPT_VERSION="1.0.0-beta.1"
HENGLOS_DIR="${HENGLOS_DIR:-./henglos}"
COMPOSE_DIR="deploy/docker"
SOURCE_REPO_URL="${HENGLOS_REPO_URL:-https://raw.githubusercontent.com/Henglos/henglos-io/main}"
UPGRADE=0
NO_START=0

# Apply ANSI styling only when stdout is a terminal that supports it and the user hasn't opted out.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != "dumb" ]; then
	BOLD=$(printf '\033[1m')
	DIM=$(printf '\033[2m')
	CYAN=$(printf '\033[36m')
	GREEN=$(printf '\033[32m')
	YELLOW=$(printf '\033[33m')
	RESET=$(printf '\033[0m')
else
	BOLD='' DIM='' CYAN='' GREEN='' YELLOW='' RESET=''
fi

if [ -t 2 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != "dumb" ]; then
	RED=$(printf '\033[1;31m')
	RED_RESET=$(printf '\033[0m')
else
	RED='' RED_RESET=''
fi

say() { printf '%s\n' "$*"; }
ok() { printf '%s\342\234\224%s %s\n' "$GREEN" "$RESET" "$*"; }

fail() {
	printf '%sError:%s %s\n' "$RED" "$RED_RESET" "$*" >&2
	exit 1
}

usage() {
	cat <<EOF
get-henglos.sh v${SCRIPT_VERSION} — set up a self-hosted henglos-io instance with docker compose.

Usage: get-henglos.sh [options]
       curl -fsSL https://get.henglos.io | sh -s -- [options]

Options:
  --upgrade          Upgrade an existing install: updates config files and pulls latest images.
  --no-start         Write the configuration files but don't start henglos-io.
  --help             Show this help.

Environment:
  HENGLOS_DIR        Install directory (default: ./henglos)
  HENGLOS_REPO_URL   Base URL for raw repository files
EOF
}

parse_args() {
	while [ $# -gt 0 ]; do
		case "$1" in
			--upgrade) UPGRADE=1 ;;
			--no-start) NO_START=1 ;;
			--help | -h)
				usage
				exit 0
				;;
			*)
				usage >&2
				fail "unknown option: $1"
				;;
		esac
		shift
	done
}

check_deps() {
	command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Install it first: https://get.docker.com"
	docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 plugin is not available."
	docker info >/dev/null 2>&1 || fail "The Docker daemon is not running."

	ok "Docker found ($(docker --version | awk '{print $3}' | tr -d ','))"
	ok "Docker Compose found ($(docker compose version --short 2>/dev/null))"
}

fetch_files() {
	mkdir -p "${HENGLOS_DIR}"
	for file in docker-compose.yaml Caddyfile .env.example; do
		url="${SOURCE_REPO_URL}/${COMPOSE_DIR}/${file}"
		if command -v curl >/dev/null 2>&1; then
			curl -fsSL "$url" -o "${HENGLOS_DIR}/${file}" || fail "Could not download ${file} from ${url}"
		elif command -v wget >/dev/null 2>&1; then
			wget -q "$url" -O "${HENGLOS_DIR}/${file}" || fail "Could not download ${file} from ${url}"
		else
			fail "Neither curl nor wget is available."
		fi
	done
}

compose() {
	docker compose -f "${HENGLOS_DIR}/docker-compose.yaml" "$@"
}

print_summary() {
	cat <<EOF

${BOLD}henglos-io is set up!${RESET}
${BOLD}Data/Config stored in:${RESET} ${HENGLOS_DIR}
${BOLD}Files:${RESET} ${HENGLOS_DIR}/docker-compose.yaml, ${HENGLOS_DIR}/Caddyfile, ${HENGLOS_DIR}/.env

${BOLD}To stop:${RESET}  docker compose -f ${HENGLOS_DIR}/docker-compose.yaml down
${BOLD}To start:${RESET} docker compose -f ${HENGLOS_DIR}/docker-compose.yaml up -d

${GREEN}➜${RESET}  ${BOLD}All set! Review your ${CYAN}${HENGLOS_DIR}/.env${RESET}${BOLD} file if configuration is needed.${RESET}
EOF
}

main() {
	parse_args "$@"
	check_deps

	if [ -f "${HENGLOS_DIR}/docker-compose.yaml" ] || [ -f "${HENGLOS_DIR}/.env" ]; then
		if [ "$UPGRADE" -eq 1 ]; then
			say "Updating configuration files and pulling latest images..."
			fetch_files
			compose pull
			compose up -d --quiet-pull
			ok "Upgrade complete!"
			exit 0
		fi
		say "Found an existing install in ${HENGLOS_DIR} — leaving it untouched."
		say "To start it:  docker compose -f ${HENGLOS_DIR}/docker-compose.yaml up -d"
		say "To upgrade:   curl -fsSL https://get.henglos.io | sh -s -- --upgrade"
		exit 0
	fi  # <--- Corrigido de ']' para 'fi'

	[ "$UPGRADE" -eq 0 ] || fail "no existing install found in ${HENGLOS_DIR} — run without --upgrade to install."

	say "Downloading deployment files..."
	fetch_files
	ok "Downloaded compose, Caddyfile, and template files to ${HENGLOS_DIR}"

	if [ ! -f "${HENGLOS_DIR}/.env" ]; then
		cp "${HENGLOS_DIR}/.env.example" "${HENGLOS_DIR}/.env"
		chmod 600 "${HENGLOS_DIR}/.env"
		ok "Created ${HENGLOS_DIR}/.env from template"
	fi

	if [ "$NO_START" -eq 1 ]; then
		say ""
		say "Not starting (--no-start). When ready:"
		say "  docker compose -f ${HENGLOS_DIR}/docker-compose.yaml up -d"
		exit 0
	fi

	say "Pulling images and starting containers..."
	compose pull
	compose up -d --quiet-pull
	ok "Started henglos-io successfully!"
	print_summary
}

main "$@"