#!/bin/sh
#
# get-hio.sh — installs Henglos IO with Docker Compose: downloads the deployment
# files, generates the secrets and starts everything.
#
set -eu

SCRIPT_VERSION="1.1.0"
HENGLOS_DIR="${HENGLOS_DIR:-./henglos}"
COMPOSE_DIR="deploy/docker"
SOURCE_REPO_URL="${HENGLOS_REPO_URL:-https://raw.githubusercontent.com/Henglos/henglos-io/main}"
INSTALL_URL="${SOURCE_REPO_URL}/${COMPOSE_DIR}/get-hio.sh"
UPGRADE=0
NO_START=0
TMP_DIR=""

# Apply ANSI styling only when stdout is a terminal that supports it and the user hasn't opted out.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != "dumb" ]; then
	BOLD=$(printf '\033[1m')
	CYAN=$(printf '\033[36m')
	GREEN=$(printf '\033[32m')
	RESET=$(printf '\033[0m')
else
	BOLD='' CYAN='' GREEN='' RESET=''
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
	cat <<USAGE
get-hio.sh v${SCRIPT_VERSION} — set up a self-hosted Henglos IO with Docker Compose.

Usage: get-hio.sh [options]
       curl -fsSL ${INSTALL_URL} | sh -s -- [options]

Options:
  --upgrade          Upgrade an existing install: updates the deployment files and
                     pulls the images. Your .env is kept.
  --no-start         Write the configuration files but don't start Henglos IO.
  --help             Show this help.

Environment:
  HENGLOS_DIR        Install directory (default: ./henglos)
  HENGLOS_REPO_URL   Base URL for raw repository files
USAGE
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

download() {
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL "$1" -o "$2"
	elif command -v wget >/dev/null 2>&1; then
		wget -q "$1" -O "$2"
	else
		fail "Neither curl nor wget is available."
	fi
}

# All or nothing: the files only reach the install directory once every one of
# them downloaded, so a failed attempt doesn't look like an install later on.
fetch_files() {
	TMP_DIR=$(mktemp -d)
	trap 'rm -rf "$TMP_DIR"' EXIT

	for file in docker-compose.yaml Caddyfile .env.example; do
		url="${SOURCE_REPO_URL}/${COMPOSE_DIR}/${file}"
		download "$url" "${TMP_DIR}/${file}" || fail "Could not download ${file} from ${url}"
	done

	mkdir -p "${HENGLOS_DIR}"
	for file in docker-compose.yaml Caddyfile .env.example; do
		mv -f "${TMP_DIR}/${file}" "${HENGLOS_DIR}/${file}"
	done
}

generate_secret() {
	if command -v openssl >/dev/null 2>&1; then
		openssl rand -hex 32
	else
		od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
	fi
}

# Fills a secret left empty in the .env. One that already has a value is never
# replaced: changing them signs everyone out and loses the saved credentials.
ensure_secret() {
	env_file="${HENGLOS_DIR}/.env"
	if grep -q "^$1=." "$env_file"; then
		return 0
	fi

	secret=$(generate_secret)
	if grep -q "^$1=" "$env_file"; then
		(umask 077 && sed "s/^$1=.*/$1=${secret}/" "$env_file" >"${env_file}.tmp")
		mv -f "${env_file}.tmp" "$env_file"
	else
		printf '%s=%s\n' "$1" "$secret" >>"$env_file"
	fi
	ok "Generated $1"
}

ensure_env() {
	if [ ! -f "${HENGLOS_DIR}/.env" ]; then
		cp "${HENGLOS_DIR}/.env.example" "${HENGLOS_DIR}/.env"
		chmod 600 "${HENGLOS_DIR}/.env"
		ok "Created ${HENGLOS_DIR}/.env from template"
	fi
	ensure_secret HIO_JWT_SECRET
	ensure_secret HIO_SECRETS_KEY
}

compose() {
	docker compose -f "${HENGLOS_DIR}/docker-compose.yaml" "$@"
}

# The address to open, from what the .env says it's served at.
site_url() {
	site=$(sed -n 's/^HIO_SITE_ADDRESS=//p' "${HENGLOS_DIR}/.env" | tail -n 1)
	port=$(sed -n 's/^HIO_HTTP_PORT=//p' "${HENGLOS_DIR}/.env" | tail -n 1)
	port="${HIO_HTTP_PORT:-${port:-80}}"

	case "$site" in
		"" | :*)
			if [ "$port" = "80" ]; then
				printf 'http://localhost'
			else
				printf 'http://localhost:%s' "$port"
			fi
			;;
		http://* | https://*) printf '%s' "$site" ;;
		*) printf 'https://%s' "$site" ;;
	esac
}

print_summary() {
	cat <<SUMMARY

${BOLD}Henglos IO is running!${RESET}

${GREEN}➜${RESET}  ${BOLD}Open ${CYAN}$(site_url)${RESET}${BOLD} — the first time, it asks you to create your account.${RESET}

${BOLD}Files:${RESET}    ${HENGLOS_DIR}/docker-compose.yaml, ${HENGLOS_DIR}/Caddyfile, ${HENGLOS_DIR}/.env
${BOLD}To stop:${RESET}  docker compose -f ${HENGLOS_DIR}/docker-compose.yaml down
${BOLD}To start:${RESET} docker compose -f ${HENGLOS_DIR}/docker-compose.yaml up -d

Keep ${HENGLOS_DIR}/.env safe: without its HIO_SECRETS_KEY the saved credentials can't be read.
SUMMARY
}

start() {
	if [ "$NO_START" -eq 1 ]; then
		say ""
		say "Not starting (--no-start). When ready:"
		say "  docker compose -f ${HENGLOS_DIR}/docker-compose.yaml up -d"
		return 0
	fi

	say "Pulling images and starting containers..."
	compose pull --quiet
	compose up -d
	ok "Henglos IO started"
	print_summary
}

main() {
	parse_args "$@"
	check_deps

	if [ -f "${HENGLOS_DIR}/docker-compose.yaml" ]; then
		if [ "$UPGRADE" -eq 0 ]; then
			say "Found an existing install in ${HENGLOS_DIR} — leaving it untouched."
			say "To start it:  docker compose -f ${HENGLOS_DIR}/docker-compose.yaml up -d"
			say "To upgrade:   curl -fsSL ${INSTALL_URL} | sh -s -- --upgrade"
			return 0
		fi
		say "Updating the deployment files..."
	else
		[ "$UPGRADE" -eq 0 ] || fail "no existing install found in ${HENGLOS_DIR} — run without --upgrade to install."
		say "Downloading the deployment files..."
	fi

	fetch_files
	ok "Downloaded docker-compose.yaml, Caddyfile and .env.example to ${HENGLOS_DIR}"
	ensure_env
	start
}

# Last, and everything else in functions: if the download is cut short when
# piped into sh, nothing runs.
main "$@"
