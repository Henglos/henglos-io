# Henglos IO with Docker

The studio and the hosting, behind [Caddy](https://caddyserver.com) on a single address.

```txt
Browser ──▶ Caddy ──▶ /io/*  ──▶ hosting   (API, sockets, collaborative editing)
                  └─▶ the rest ──▶ studio
```

## Requirements

- Docker with Compose (`docker compose`).
- For HTTPS: a domain pointing to this machine, with ports 80 and 443 open.

## Install

```bash
cp .env.example .env
```

Fill in the two secrets in `.env` (`openssl rand -hex 32` makes one):

```env
HIO_JWT_SECRET=…
HIO_SECRETS_KEY=…
```

Then start it:

```bash
docker compose up -d
```

Open `http://<this machine>` — the first time, the setup page asks for the account to create.

### With a domain (HTTPS)

Set the domain in `.env`, and Caddy gets a certificate from Let's Encrypt on its own:

```env
HIO_SITE_ADDRESS=hio.example.com
```

```bash
docker compose up -d
```

## Connect a driver

On the computer your boards are plugged into, with the [CLI](../../apps/cli):

```bash
hio driver configure https://hio.example.com     # the address above
hio driver login <pair-token> "My bench"         # the token from the studio's Drivers page
hio driver start
```

The driver installs packages from the same registry as the hosting: if you changed
`HIO_REGISTRY_URL`, set `HENGLOS_REGISTRY` to the same value on the driver's machine.

## Update

```bash
# HIO_VERSION in .env to the new version, then:
docker compose pull
docker compose up -d
```

The database is brought up to date when the hosting starts.

## Back up

Everything lives in the `hio-data` volume (the SQLite database). Stop the hosting and copy it:

```bash
docker compose stop hosting
docker run --rm -v henglos-io_hio-data:/data -v "$PWD":/backup alpine tar czf /backup/hio-data.tgz -C /data .
docker compose start hosting
```

## Settings

| Variable | Default | What it is |
| --- | --- | --- |
| `HIO_VERSION` | `1.0.0-beta.1` | The images' version. |
| `HIO_SITE_ADDRESS` | `:80` | A domain (HTTPS), or `:80` (plain HTTP). |
| `HIO_HTTP_PORT` / `HIO_HTTPS_PORT` | `80` / `443` | The host ports Caddy listens on. |
| `HIO_JWT_SECRET` | — | Required. Signs the sign-in tokens. |
| `HIO_SECRETS_KEY` | — | Required. Encrypts the saved credentials — keep it. |
| `HIO_REGISTRY_URL` | npmjs | Where boards, components and the platform come from. |
| `HIO_TELEMETRY` | `true` | Anonymous usage statistics; `false` turns them off. |
