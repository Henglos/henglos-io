#!/bin/sh
#
# test-get-hio.sh — test harness for get-henglos.sh
#
set -eu

SCRIPT_VERSION="1.0.0"
TEST_DIR="./test-hio-sandbox"
INSTALL_SCRIPT="./get-henglos.sh"

# Terminal colors
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != "dumb" ]; then
	BOLD=$(printf '\033[1m')
	GREEN=$(printf '\033[32m')
	RED=$(printf '\033[1;31m')
	RESET=$(printf '\033[0m')
else
	BOLD='' GREEN='' RED='' RESET=''
fi

say() { printf '%s\n' "$*"; }
ok() { printf '%s✔%s %s\n' "$GREEN" "$RESET" "$*"; }
fail() { printf '%sTest Error:%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

cleanup() {
	say "Cleaning up test environment (${TEST_DIR})..."
	rm -rf "${TEST_DIR}"
	rm -rf "deploy"
}

# Ensure cleanup on exit
trap cleanup EXIT

setup_mock_files() {
	say "Creating local deploy/docker mock folder for tests..."
	mkdir -p "deploy/docker"
	
	echo "VERSION=1.0" > "deploy/docker/.env.example"
	echo "mock caddyfile content" > "deploy/docker/Caddyfile"
	echo "services: { app: { image: test } }" > "deploy/docker/docker-compose.yaml"
}

run_tests() {
	say "${BOLD}=== Starting get-henglos.sh tests ===${RESET}"

	# 1. Validate if the install script exists
	[ -f "$INSTALL_SCRIPT" ] || fail "The script ${INSTALL_SCRIPT} was not found in the root directory."
	ok "Main script found."

	# 2. Setup local simulated environment
	setup_mock_files

	# 3. Test basic installation in an isolated directory using --no-start
	say "Running the installer pointing to the test directory..."
	
	export HENGLOS_DIR="${TEST_DIR}"
	export HENGLOS_REPO_URL="file://$(pwd)"
	
	if sh "$INSTALL_SCRIPT" --no-start; then
		ok "Script executed successfully (--no-start)."
	else
		fail "The script failed to execute."
	fi

	# 4. Validate if files were created in the target directory
	[ -f "${TEST_DIR}/docker-compose.yaml" ] || fail "docker-compose.yaml was not copied."
	[ -f "${TEST_DIR}/Caddyfile" ] || fail "Caddyfile was not copied."
	[ -f "${TEST_DIR}/.env.example" ] || fail ".env.example was not copied."
	[ -f "${TEST_DIR}/.env" ] || fail ".env file was not automatically generated."
	ok "All configuration files were generated/copied correctly in directory ${TEST_DIR}."

	say ""
	ok "${BOLD}All tests passed successfully!${RESET}"
}

run_tests "$@"