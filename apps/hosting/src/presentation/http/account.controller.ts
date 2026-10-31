import { GetMeAccountUseCase } from "@/application/use-cases/account/GetMeAccount.use-case";
import { MinimalUser } from "@/domain/entities/AuthUser";
import { AuthUser } from "@/infrastructure/http/decorators/AuthUser.decorator";
import { AuthGuard } from "@/infrastructure/http/guards/Auth.guard";
import { Controller, Delete, Get, UseGuards } from "@nestjs/common";

import { DeleteAccountUseCase } from "@/application/use-cases/account/DeleteAccount.use-case";
import { AccountOut, DeleteAccountOut } from "@henglosio/shared";

/** /io/api/v1/accounts — the signed-in user's own account. */
@Controller("accounts")
export class AccountController {

	constructor(
		private readonly getMeAccountUseCase: GetMeAccountUseCase,
		private readonly deleteAccountUseCase: DeleteAccountUseCase
	) {}

	/** GET /accounts — who's signed in: id, email, username. */
	@Get()
	@UseGuards(AuthGuard)
	async getMeAccount(
		@AuthUser() minimalUser: MinimalUser
	): Promise<AccountOut> {

		const user = await this.getMeAccountUseCase.execute(minimalUser.userId);

		return {
			id: user.id!,
			email: user.email.getValue(),
			username: user.username.getValue()
		}

	}

	/** DELETE /accounts — deletes the account and its workflows. */
	@Delete()
	@UseGuards(AuthGuard)
	async deleteAccount(
		@AuthUser() minimalUser: MinimalUser
	): Promise<DeleteAccountOut> {

		await this.deleteAccountUseCase.execute(minimalUser.userId);

		return { status: "deleted" };

	}

}
