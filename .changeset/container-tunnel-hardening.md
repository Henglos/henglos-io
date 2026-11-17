---
"@henglosio/cli": patch
---

Driver: the build containers' tunnels listen only where containers reach the host (the loopback on Docker Desktop, the Docker bridge's gateway on a native Linux engine; HIO_TUNNEL_HOST overrides it), not on every interface; a container's messages count only with its session's token (HIO_CALLBACK_TOKEN); the unused /serial-control endpoint is gone.
