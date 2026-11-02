#!/bin/sh
#
# test-get-hio.sh — tests get-hio.sh, with no network and no Docker: everything
# happens in a temporary directory, the repository is a local mock and `docker`
# a stub that records its calls.
#
#   sh deploy/docker/test-get-hio.sh
#
set -eu

INSTALL_SCRIPT="$(cd "$(dirname "$0")" && pwd)/get-hio.sh"
SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT

ok() { printf '\342\234\224 %s\n' "$*"; }
fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }

value_of() { sed -n "s/^$1=//p" "$2"; }

# The mock repository, served through file:// (pwd -W: Git Bash's curl wants the Windows path).
mkdir -p "$SANDBOX/repo/deploy/docker" "$SANDBOX/bin"
cd "$SANDBOX"
printf 'services: {}\n' >repo/deploy/docker/docker-compose.yaml
printf ':80 {}\n' >repo/deploy/docker/Caddyfile
printf 'HIO_SITE_ADDRESS=:80\nHIO_HTTP_PORT=80\nHIO_JWT_SECRET=\nHIO_SECRETS_KEY=\n' >repo/deploy/docker/.env.example
REPO_PATH=$(cd repo && { pwd -W 2>/dev/null || pwd; })

cat >bin/docker <<STUB
#!/bin/sh
echo "\$*" >>"$SANDBOX/docker.log"
case "\$*" in
	--version) echo "Docker version 1.0.0, build test" ;;
	"compose version --short") echo "2.0.0" ;;
esac
exit 0
STUB
chmod +x bin/docker
PATH="$SANDBOX/bin:$PATH"
HENGLOS_REPO_URL="file:///$REPO_PATH"
export PATH HENGLOS_REPO_URL

# A fresh install: the files, the secrets, and it starts.
HENGLOS_DIR=fresh sh "$INSTALL_SCRIPT" >fresh.log
for file in docker-compose.yaml Caddyfile .env.example .env; do
	[ -f "fresh/$file" ] || fail "$file was not installed"
done
JWT=$(value_of HIO_JWT_SECRET fresh/.env)
KEY=$(value_of HIO_SECRETS_KEY fresh/.env)
printf '%s' "$JWT" | grep -Eq '^[0-9a-f]{64}$' || fail "HIO_JWT_SECRET is not 32 random bytes: '$JWT'"
printf '%s' "$KEY" | grep -Eq '^[0-9a-f]{64}$' || fail "HIO_SECRETS_KEY is not 32 random bytes: '$KEY'"
[ "$JWT" != "$KEY" ] || fail "both secrets are the same"
grep -q "up -d" docker.log || fail "it didn't start the containers"
grep -q "http://localhost" fresh.log || fail "the summary doesn't say what to open"
case "$(uname -s)" in
	MINGW* | MSYS* | CYGWIN*) ;; # No Unix permissions there.
	*) [ "$(ls -l fresh/.env | cut -c1-10)" = "-rw-------" ] || fail ".env is readable by others" ;;
esac
ok "a fresh install downloads the files, generates the secrets and starts"

# Running it again changes nothing.
: >docker.log
HENGLOS_DIR=fresh sh "$INSTALL_SCRIPT" >again.log
grep -q "leaving it untouched" again.log || fail "it didn't recognize the install"
[ "$(value_of HIO_JWT_SECRET fresh/.env)" = "$JWT" ] || fail "running it again changed the secrets"
if grep -q "up -d" docker.log; then fail "running it again touched the containers"; fi
ok "running it again leaves the install alone"

# An upgrade takes the new files and keeps the secrets and the settings.
printf 'services: { new: {} }\n' >repo/deploy/docker/docker-compose.yaml
sed 's/^HIO_HTTP_PORT=.*/HIO_HTTP_PORT=8088/' fresh/.env >fresh/.env.edited
mv fresh/.env.edited fresh/.env
HENGLOS_DIR=fresh sh "$INSTALL_SCRIPT" --upgrade >upgrade.log
grep -q "new" fresh/docker-compose.yaml || fail "the upgrade didn't update the compose file"
[ "$(value_of HIO_JWT_SECRET fresh/.env)" = "$JWT" ] || fail "the upgrade changed HIO_JWT_SECRET"
[ "$(value_of HIO_SECRETS_KEY fresh/.env)" = "$KEY" ] || fail "the upgrade changed HIO_SECRETS_KEY"
[ "$(value_of HIO_HTTP_PORT fresh/.env)" = "8088" ] || fail "the upgrade changed the settings"
grep -q "http://localhost:8088" upgrade.log || fail "the summary ignores the port"
ok "an upgrade updates the files and keeps the .env"

# An upgrade also fills secrets left empty, or missing.
mkdir empty
cp repo/deploy/docker/docker-compose.yaml empty/
printf 'HIO_JWT_SECRET=\n' >empty/.env
HENGLOS_DIR=empty sh "$INSTALL_SCRIPT" --upgrade >/dev/null
[ -n "$(value_of HIO_JWT_SECRET empty/.env)" ] || fail "an empty secret wasn't filled"
[ -n "$(value_of HIO_SECRETS_KEY empty/.env)" ] || fail "a missing secret wasn't added"
ok "an upgrade fills secrets left empty"

# --no-start configures, and starts nothing.
: >docker.log
HENGLOS_DIR=idle sh "$INSTALL_SCRIPT" --no-start >/dev/null
[ -n "$(value_of HIO_JWT_SECRET idle/.env)" ] || fail "--no-start didn't generate the secrets"
if grep -q "up -d" docker.log; then fail "--no-start started the containers"; fi
ok "--no-start doesn't start anything"

# What must fail, fails, and leaves nothing behind.
if HENGLOS_DIR=none sh "$INSTALL_SCRIPT" --upgrade >/dev/null 2>&1; then fail "--upgrade without an install succeeded"; fi
if HENGLOS_DIR=none sh "$INSTALL_SCRIPT" --nope >/dev/null 2>&1; then fail "an unknown option succeeded"; fi
rm repo/deploy/docker/Caddyfile
if HENGLOS_DIR=partial sh "$INSTALL_SCRIPT" >/dev/null 2>&1; then fail "a failed download succeeded"; fi
[ ! -e partial ] || fail "a failed download left files behind"
ok "failures fail, and a failed download leaves nothing behind"

printf '\nAll tests passed.\n'
