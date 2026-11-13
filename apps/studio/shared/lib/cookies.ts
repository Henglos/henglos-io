/**
 * Cookie utility helpers.
 *
 * Tokens are stored as cookies readable by JS (no HttpOnly) so the client can
 * read them and build the Authorization header.
 *
 * No explicit domain=: the cookie is host-only, scoped to the current host
 * (localhost, a LAN IP, or a real domain) — there are no separate subdomains
 * (api./app./identify.) to share a cookie between any more.
 *
 * SameSite=Lax: allows sending on top-level navigations without opening
 * CSRF holes in POST requests. Secure is added automatically when served
 * over HTTPS.
 */

function isSecure(): boolean {
	return location.protocol === "https:";
}

/**
 * Reads a cookie by name. Returns null when it doesn't exist.
 */
export function getCookie(name: string): string | null {
	const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
	return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Writes a host-only cookie on the current host.
 * @param maxAgeSeconds  None → a session cookie (expires when the browser closes).
 */
export function setCookie(name: string, value: string, maxAgeSeconds?: number): void {
	let cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
	if (isSecure()) cookie += "; Secure";
	if (maxAgeSeconds) cookie += `; max-age=${maxAgeSeconds}`;
	document.cookie = cookie;
}

/**
 * Removes a cookie.
 */
export function removeCookie(name: string): void {
	document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}
