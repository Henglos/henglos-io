/**
 * Cookie utility helpers.
 *
 * Tokens são armazenados como cookies acessíveis ao JS (sem HttpOnly) para que
 * o cliente possa ler e montar o header Authorization.
 *
 * Sem domain= explícito: o cookie fica host-only, escopado pro host atual
 * (localhost, IP de LAN, ou domínio real) — não há mais subdomínios
 * separados (api./app./identify.) pra compartilhar cookie entre eles.
 *
 * SameSite=Lax: permite envio em navegações top-level, sem abrir brechas
 * de CSRF em requests POST. Secure é adicionado automaticamente quando
 * servido por HTTPS.
 */

function isSecure(): boolean {
	return location.protocol === "https:";
}

/**
 * Lê um cookie pelo nome. Retorna null se não existir.
 */
export function getCookie(name: string): string | null {
	const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
	return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Grava um cookie host-only no host atual.
 * @param maxAgeSeconds  Sem valor → cookie de sessão (expira ao fechar o browser).
 */
export function setCookie(name: string, value: string, maxAgeSeconds?: number): void {
	let cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
	if (isSecure()) cookie += "; Secure";
	if (maxAgeSeconds) cookie += `; max-age=${maxAgeSeconds}`;
	document.cookie = cookie;
}

/**
 * Remove um cookie.
 */
export function removeCookie(name: string): void {
	document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}
