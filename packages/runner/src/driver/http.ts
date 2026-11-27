import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import type { BrokerErrorBody } from "../contract/broker.js";

/** A broker call the driver refused, or one that never reached it. */
export class DriverError extends Error {

	readonly id: string;
	readonly status: number | undefined;

	constructor(id: string, message: string, status?: number) {
		super(message);
		this.name = "DriverError";
		this.id = id;
		this.status = status;
	}

}

/**
 * The Runner's line to the driver's broker: plain HTTP with JSON, under
 * `baseUrl`, each request carrying the session's token. It knows nothing of
 * flash methods — see FlashBroker for that.
 */
export class DriverClient {

	private readonly baseUrl: string;
	private readonly token: string | undefined;

	constructor(baseUrl: string, token?: string) {
		this.baseUrl = baseUrl.replace(/\/+$/, "");
		this.token = token;
	}

	/**
	 * The driver's client from the environment the driver starts the container
	 * with — null without HIO_BROKER_URL (no driver: a terminal).
	 */
	static fromEnv(env: NodeJS.ProcessEnv = process.env): DriverClient | null {
		const url = env["HIO_BROKER_URL"];
		return url ? new DriverClient(url, env["HIO_CALLBACK_TOKEN"]) : null;
	}

	get<T>(route: string): Promise<T> {
		return this.request<T>("GET", route);
	}

	post<T>(route: string, body: unknown): Promise<T> {
		return this.request<T>("POST", route, body);
	}

	async delete(route: string): Promise<void> {
		await this.request<unknown>("DELETE", route);
	}

	/** PUTs the file at `file` to `url` — a URL the driver gave, not a route. */
	async upload(url: string, file: string): Promise<void> {
		const { size } = await stat(file);
		const body = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
		const response = await this.fetch(url, {
			method: "PUT",
			headers: { ...this.authorization(), "Content-Type": "application/octet-stream", "Content-Length": String(size) },
			body,
			// Node's fetch needs it to send a stream.
			duplex: "half",
		} as RequestInit);
		if (!response.ok) throw await this.failure(response);
	}

	private async request<T>(method: string, route: string, body?: unknown): Promise<T> {
		const response = await this.fetch(`${this.baseUrl}${route}`, {
			method,
			headers: {
				...this.authorization(),
				...(body !== undefined ? { "Content-Type": "application/json" } : {}),
			},
			...(body !== undefined ? { body: JSON.stringify(body) } : {}),
		});
		if (!response.ok) throw await this.failure(response);
		const text = await response.text();
		return (text ? JSON.parse(text) : undefined) as T;
	}

	private async fetch(url: string, init: RequestInit): Promise<Response> {
		try {
			return await fetch(url, init);
		} catch (err) {
			throw new DriverError("driver_unreachable", `The driver didn't answer at ${url}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	// The driver's BrokerErrorBody when it sent one, the status otherwise.
	private async failure(response: Response): Promise<DriverError> {
		const body = await response.json().catch(() => null) as Partial<BrokerErrorBody> | null;
		return new DriverError(
			body?.id ?? "driver_error",
			body?.message ?? `The driver answered ${response.status} ${response.statusText}.`,
			response.status,
		);
	}

	private authorization(): Record<string, string> {
		return this.token ? { Authorization: `Bearer ${this.token}` } : {};
	}

}
