/**
 * The flash broker's contract between the Runner (in the build container) and
 * the driver, which has the hardware. The studio picked where the firmware goes
 * (the flash target: a method and its address); the Runner asks the driver to
 * set that method up, and the driver answers with how to reach the board. The
 * firmware itself goes through the broker only where there's no other way
 * (uf2: the container can't see the host's drive).
 *
 * Every route is under HIO_BROKER_URL, authorized like the callback
 * (`Authorization: Bearer <HIO_CALLBACK_TOKEN>`):
 *
 *   POST   /connections               BrokerConnectRequest → BrokerConnection
 *   DELETE /connections/:id           releases it
 *   PUT    /connections/:id/upload    the file, as the body (a method's own route, see uf2)
 *
 * A failure answers with a non-2xx status and a BrokerErrorBody. What a
 * connection set up lasts until it's released — or until the flash ends, should
 * the Runner die first: the driver releases everything the session opened.
 */

/**
 * Each way a board can be written:
 * - `request`: what the Runner asks the driver with (POST /connections);
 * - `connection`: what the driver answers;
 * - `send`: what a board's script passes to `ctx.send` besides the request —
 *   what stays in the container.
 */
export type FlashMethodContracts = {

	/**
	 * The board's serial port, through the driver's RFC 2217 tunnel. The image's
	 * tools (esptool, …) do the writing: `write` gets the tunnel.
	 */
	serial: {
		request: { baudrate?: number };
		connection: {
			/** rfc2217://… — opened by the image's tools as they are. */
			url: string;
			baudrate: number;
		};
		send: {
			/** Writes the firmware through `connection` — the tunnel is released once it settles. */
			write: (connection: FlashMethodContracts["serial"]["connection"]) => Promise<void>;
		};
	};

	/**
	 * The board's UF2 mass-storage drive — the one the flash target names. The
	 * driver waits for it (putting the board in its bootloader first when it
	 * isn't there), then takes the file (a PUT to `uploadUrl`) and copies it.
	 */
	uf2: {
		request: {
			/** How long to wait for the drive to show up. Default: 15 s. */
			timeoutMs?: number;
		};
		connection: {
			uploadUrl: string;
			/** Where the drive is mounted, for the log. */
			volume: string;
		};
		send: {
			/** The .uf2 file, in the container. */
			file: string;
		};
	};

}

export type FlashMethodName = keyof FlashMethodContracts;
export type FlashMethodRequest<K extends FlashMethodName> = FlashMethodContracts[K]["request"];
export type FlashMethodConnection<K extends FlashMethodName> = FlashMethodContracts[K]["connection"];
/** What `ctx.send(name, …)` takes: the request and what stays in the container. */
export type FlashMethodSendOptions<K extends FlashMethodName> = FlashMethodRequest<K> & FlashMethodContracts[K]["send"];

/** POST /connections. */
export type BrokerConnectRequest<K extends FlashMethodName = FlashMethodName> = {

	method: K;
	options: FlashMethodRequest<K>;

}

/** POST /connections' answer. */
export type BrokerConnection<K extends FlashMethodName = FlashMethodName> = {

	id: string;
	method: K;
	connection: FlashMethodConnection<K>;

}

/** The ids a failed broker call answers with. */
export type BrokerErrorId = "method_unsupported" | "device_unavailable" | "bad_request" | "not_found";

/** What a failed broker call answers with. */
export type BrokerErrorBody = {

	id: BrokerErrorId | (string & {});
	message: string;

}

/**
 * How a board is written. A board's script gets `ctx.send`, and `ctx.method`:
 * the method the studio picked.
 *
 *   if (ctx.method === "uf2") await ctx.send("uf2", { file: firmware });
 *
 * `send` asks the driver to set the method up, writes, and has the driver
 * release it — whether the write worked or not. A plain function, so it can be
 * passed on without binding.
 */
export type FlashBroker = {

	/** Writes the firmware by method `name`. Rejects (DriverError) when it isn't the one the flash target set up. */
	send: <K extends FlashMethodName>(name: K, options: FlashMethodSendOptions<K>) => Promise<void>;

}
