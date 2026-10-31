import { DeviceDTO } from "@henglosio/shared";
import { injectable } from "tsyringe";
import { CommandContext } from "../../../domain/entities/CommandContext.js";
import { SerialPort } from "serialport";

/** The serial ports on this machine — the boards plugged in. */
@injectable()
export class ListDevicesUseCase {
	
	constructor() {}

	async execute(ctx: CommandContext): Promise<DeviceDTO[]> {
		const allPorts = await SerialPort.list();

		return allPorts.map((p) => ({
			port: p.path,
			manufacturer: p.manufacturer ?? undefined,
			serialNumber: p.serialNumber ?? undefined,
		}));

	}
}
