import type { VolumeDTO } from "@henglosio/shared";
import { injectable } from "tsyringe";
import { UF2Drives } from "../../services/UF2Drives.service.js";

/** The removable drives on this machine — where a UF2 board's bootloader shows up. */
@injectable()
export class ListVolumesUseCase {

	constructor(private readonly drives: UF2Drives) {}

	execute(): Promise<VolumeDTO[]> {
		return this.drives.list();
	}

}
