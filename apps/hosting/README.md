# Hosting

`hosting`

The Henglos IO server — the backend the studio talks to.

## What it does

- Keeps the accounts, the workflows and the installed packages.
- Lets several people edit the same workflow at once.
- Connects to the drivers on users' computers and passes the studio's commands on to the boards.

## Where it fits

```txt
Studio (browser)  ⇄  Hosting  ⇄  Driver (your computer)  ⇄  Board (USB)
```

The hosting sits in the middle: the studio never talks to a driver directly.

## Running it

With Docker, from the repository root:

```bash
docker build -f apps/hosting/Dockerfile -t henglosio/hosting .
docker run -p 3333:3333 -v hio-data:/data -e HIO_JWT_SECRET=… henglosio/hosting
```

Its settings are environment variables — see [example.env](example.env).

## License

Part of Henglos IO, distributed under the [Sustainable Use License](LICENSE).
