import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import type { Env } from "@/config/env.schema";

const ALGORITHM = "aes-256-gcm";
// Stored as "v1:<iv>:<tag>:<ciphertext>", base64 each — the version lets the
// scheme change later without reading old values wrong.
const VERSION = "v1";

/**
 * Encrypts what the hosting keeps secret (the credentials' fields) with
 * AES-256-GCM — authenticated: a value tampered with, or read with another
 * key, fails instead of decrypting to garbage. The key is HIO_SECRETS_KEY,
 * or one derived from HIO_JWT_SECRET when that's unset.
 */
@Injectable()
export class SecretBox {

	private readonly key: Buffer;

	constructor(config: ConfigService<Env, true>) {
		const explicit = config.get("HIO_SECRETS_KEY", { infer: true });
		const material = explicit ?? `hio-credentials:${config.get("HIO_JWT_SECRET", { infer: true })}`;
		this.key = createHash("sha256").update(material).digest();
	}

	/** Encrypts `plain` — a new random IV each time, so the same text never seals the same way twice. */
	seal(plain: string): string {
		const iv = randomBytes(12);
		const cipher = createCipheriv(ALGORITHM, this.key, iv);
		const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
		return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
	}

	/** The plain text — throws when it wasn't sealed with this key (or was changed). */
	open(sealed: string): string {
		const [version, iv, tag, data] = sealed.split(":");
		if (version !== VERSION || !iv || !tag || data === undefined) throw new Error("Not a sealed value");
		const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, "base64"));
		decipher.setAuthTag(Buffer.from(tag, "base64"));
		return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
	}

}
