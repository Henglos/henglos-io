import zod from "zod";

/**
 * The hosting's settings — environment variables (or apps/hosting/.env),
 * checked when it starts: a missing or invalid one stops it with the reason.
 * See example.env.
 */
export const EnvSchema = zod.object({

	// Where it listens.
	HIO_HOST: zod.coerce.string().default("0.0.0.0"),
	HIO_PORT: zod.coerce.number().default(3000),
	// The address it's reached at from outside.
	HIO_PUBLIC_URL: zod.string().default("https://hio.localhost"),

	// The database: only `sqlite` is implemented, at HIO_DATABASE_URL (`file:<path>`).
	HIO_DATABASE_PROVIDER: zod.enum(['sqlite', 'postgresql']),
	HIO_DATABASE_URL: zod.coerce.string(),

	// What the access tokens are signed with — users' and drivers' — and how long each lasts.
	HIO_JWT_SECRET: zod.coerce.string(),
	HIO_USER_JWT_EXPIRATION: zod.coerce.string().default("10d"),
	HIO_DRIVER_JWT_EXPIRATION: zod.coerce.string().default("30d"),

	// The key the credentials' secret fields are encrypted with (any string —
	// hashed to 256 bits). Unset: derived from HIO_JWT_SECRET, so changing
	// that one then makes the saved credentials unreadable. Set it once, keep it.
	HIO_SECRETS_KEY: zod.string().min(16).optional(),

	// The npm registry everything comes from: the boards and components (when
	// none is given) and the platform's releases (@henglosio/hio-system). Point
	// the drivers (their HIO_REGISTRY_URL) at the same one.
	HIO_REGISTRY_URL: zod.string().default("https://registry.npmjs.org/"),

	// The monorepo's packages/ folder: its boards, components and platform are
	// used instead of the registry's. Whatever isn't there still comes from
	// the registry. The Docker image sets it to the ones it ships with.
	HIO_LOCAL_PACKAGES: zod.string().optional(),

	// The origins the browser may call the API from: `*`, or a comma-separated list.
	HIO_CORS_ORIGIN: zod.string().default("*"),

	// Requests a minute one address may make to the API (see RateLimit.guard);
	// signing in, registering and pairing a driver have tighter limits of their
	// own. 0 turns rate limiting off.
	HIO_RATE_LIMIT: zod.coerce.number().int().min(0).default(600),
	// How many proxies sit in front of the hosting (Caddy in the Docker setup:
	// 1). The rate limit counts per client address, which only the proxy knows —
	// it's read from X-Forwarded-For, trusting this many hops. 0: no proxy.
	HIO_TRUST_PROXY: zod.coerce.number().int().min(0).default(0),

	// Anonymous telemetry (TelemetryService): on unless one of these says
	// otherwise — HIO_TELEMETRY=false|0|off|no, or the standard DO_NOT_TRACK=1.
	// Nothing a person wrote is sent: counts, versions, package names. See
	// docs/telemetry.md for every field.
	HIO_TELEMETRY: zod.string().optional().transform(flag),
	DO_NOT_TRACK: zod.string().optional().transform(value => value !== undefined && flag(value)),
	// Where it goes — Henglos IO's PostHog project (EU Cloud, project 326530).
	// The key is the project's public one (phc_…), meant to be shipped in
	// clients — setting either sends an installation's events somewhere else.
	HIO_TELEMETRY_HOST: zod.string().default("https://eu.i.posthog.com"),
	HIO_TELEMETRY_KEY: zod.string().default("phc_vsdW29LhfAfQzE6wToJjqGdHTErsqbW8f2FpH65NKRpJ"),
	// Logs every event instead of (only) sending it — to see exactly what leaves.
	HIO_TELEMETRY_DEBUG: zod.string().optional().transform(value => value !== undefined && flag(value)),
	// The installation's random id, kept across restarts.
	HIO_TELEMETRY_ID_FILE: zod.string().default("./data/telemetry-id"),

	// The HenglosIO release this is — the release image sets it from its tag
	// (v1.2.3). Unset (a dev run) or not a version (an edge build, "main"):
	// unknown, and no update is announced.
	HIO_VERSION: zod.string().optional(),
	// Whether the studio is told about a newer release: the hosting asks
	// GitHub for HenglosIO's tags (no data of the installation is sent) every
	// few hours. On unless HIO_UPDATE_CHECK=false|0|off|no.
	HIO_UPDATE_CHECK: zod.string().optional().transform(flag),

});

// An on/off env value: off for false / 0 / off / no (any case), on otherwise — unset is on.
function flag(value: string | undefined): boolean {
	return value === undefined || !["false", "0", "off", "no"].includes(value.trim().toLowerCase());
}

/** The settings, parsed — what ConfigService<Env> hands out. */
export type Env = zod.infer<typeof EnvSchema>;
