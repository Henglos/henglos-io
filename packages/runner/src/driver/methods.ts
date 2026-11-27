import type { FlashMethodConnection, FlashMethodContracts, FlashMethodName, FlashMethodSendOptions } from "../contract/broker.js";
import type { DriverClient } from "./http.js";

/** A flash method, as the Runner's side runs it. */
export type FlashMethod<K extends FlashMethodName> = {

	/** The `ctx.send` options that stay in the container — the rest goes to the driver. */
	local: readonly (keyof FlashMethodContracts[K]["send"])[];
	/**
	 * Writes the firmware once the driver set the method up, with what it
	 * answered (`connection`) and what the board's script gave (`options`).
	 */
	write: (
		connection: FlashMethodConnection<K>,
		options: FlashMethodSendOptions<K>,
		client: Pick<DriverClient, "upload">,
	) => Promise<void>;

}

/**
 * Each method, by name. A new method: its contract in contract/broker.ts and
 * its entry here.
 */
export const flashMethods: { [K in FlashMethodName]: FlashMethod<K> } = {

	/**
	 * The serial port: the image's tools write through the tunnel themselves.
	 *
	 *   await ctx.send("serial", {
	 *     baudrate: 460800,
	 *     write: ({ url, baudrate }) => ctx.run("esptool", ["--port", url, "--baud", String(baudrate), "write-flash", "0x0", firmware]),
	 *   });
	 */
	serial: {
		local: ["write"],
		write: (connection, options) => options.write(connection),
	},

	/**
	 * The UF2 drive: the container can't see it, so the file goes to the driver,
	 * which copies it there. Resolves once it has.
	 *
	 *   await ctx.send("uf2", { file: firmware });
	 */
	uf2: {
		local: ["file"],
		write: (connection, options, client) => client.upload(connection.uploadUrl, options.file),
	},

};

/**
 * The board's serial port as a URL the image's tools can open: the driver's
 * RFC 2217 tunnel when it lent one (USB_TUNNEL_PORT), the port itself otherwise
 * (`hio flash` in a terminal).
 */
export function resolveSerialUrl(port: string, env: NodeJS.ProcessEnv = process.env): string {
	const tunnel = env["USB_TUNNEL_PORT"];
	return tunnel ? `rfc2217://${env["USB_TUNNEL_HOST"] ?? "host.docker.internal"}:${tunnel}` : port;
}
