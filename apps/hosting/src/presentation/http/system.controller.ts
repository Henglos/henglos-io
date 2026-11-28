import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@/infrastructure/http/guards/Auth.guard";
import { GetUpdateStatusUseCase } from "@/application/use-cases/system/GetUpdateStatus.use-case";
import type { UpdateStatusOut } from "@henglosio/shared";

/** /io/api/v1/system — about this HenglosIO installation. */
@Controller("system")
export class SystemController {

	constructor(private readonly getUpdateStatusUseCase: GetUpdateStatusUseCase) {}

	/** GET /system/update — whether a newer HenglosIO was released (the studio's update alert). */
	@Get("update")
	@UseGuards(AuthGuard)
	async update(): Promise<UpdateStatusOut> {
		return this.getUpdateStatusUseCase.execute();
	}
}
