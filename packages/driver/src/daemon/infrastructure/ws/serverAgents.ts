import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";

// *.localhost is always this machine, but only browsers and curl know: Node asks
// the system, and on Windows it answers ENOTFOUND for hio.localhost. The Host
// header and the TLS name keep the original, so Caddy still sees hio.localhost.
const lookup = ((hostname, options, callback) => {
	dns.lookup(hostname.endsWith(".localhost") ? "localhost" : hostname, options, callback);
}) as LookupFunction;

/** The agent for talking to the hosting over plain HTTP (http://, ws://). */
export const serverHttpAgent = () => new http.Agent({ lookup });

/**
 * The agent for talking to the hosting over TLS (https://, wss://). Caddy's
 * `tls internal` uses a self-signed CA that Node rejects by default.
 */
export const serverHttpsAgent = () => new https.Agent({ lookup, rejectUnauthorized: false });
