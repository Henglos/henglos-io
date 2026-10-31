import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
	type CreateCredentialIn,
	CreateCredentialInSchema,
	type CredentialOut,
	type CredentialTypeOut,
	type UpdateCredentialIn,
	UpdateCredentialInSchema,
} from "@henglosio/shared";

import { AuthUser } from "@/infrastructure/http/decorators/AuthUser.decorator";
import { AuthGuard } from "@/infrastructure/http/guards/Auth.guard";
import { ZodValidationPipe } from "@/infrastructure/http/pipes/ZodValidation.pipe";
import { MinimalUser } from "@/domain/entities/AuthUser";
import { ListCredentialTypesUseCase } from "@/application/use-cases/credential/ListCredentialTypes.use-case";
import { ListCredentialsUseCase } from "@/application/use-cases/credential/ListCredentials.use-case";
import { CreateCredentialUseCase } from "@/application/use-cases/credential/CreateCredential.use-case";
import { UpdateCredentialUseCase } from "@/application/use-cases/credential/UpdateCredential.use-case";
import { DeleteCredentialUseCase } from "@/application/use-cases/credential/DeleteCredential.use-case";

/** The user's credentials — a secret field's value never comes back out (see CredentialService). */
@Controller({ path: "credentials", version: "1" })
export class CredentialController {

	constructor(
		private readonly listCredentialTypesUseCase: ListCredentialTypesUseCase,
		private readonly listCredentialsUseCase: ListCredentialsUseCase,
		private readonly createCredentialUseCase: CreateCredentialUseCase,
		private readonly updateCredentialUseCase: UpdateCredentialUseCase,
		private readonly deleteCredentialUseCase: DeleteCredentialUseCase,
	) {}

	/** The kinds there are — what the installed components declare. */
	@Get("types")
	@UseGuards(AuthGuard)
	async types(@AuthUser() authUser: MinimalUser): Promise<{ types: CredentialTypeOut[] }> {
		return { types: await this.listCredentialTypesUseCase.execute(authUser.userId) };
	}

	/** GET /credentials — the user's credentials. */
	@Get()
	@UseGuards(AuthGuard)
	async list(@AuthUser() authUser: MinimalUser): Promise<{ credentials: CredentialOut[] }> {
		return { credentials: await this.listCredentialsUseCase.execute(authUser.userId) };
	}

	/** POST /credentials — a new credential: its type, its name, its fields. */
	@Post()
	@UseGuards(AuthGuard)
	async create(
		@AuthUser() authUser: MinimalUser,
		@Body(new ZodValidationPipe(CreateCredentialInSchema)) body: CreateCredentialIn,
	): Promise<CredentialOut> {
		return this.createCredentialUseCase.execute(authUser.userId, body);
	}

	/** PATCH /credentials/:id — renames it and/or changes its fields (a secret left out stays). */
	@Patch(":id")
	@UseGuards(AuthGuard)
	async update(
		@AuthUser() authUser: MinimalUser,
		@Param("id") id: string,
		@Body(new ZodValidationPipe(UpdateCredentialInSchema)) body: UpdateCredentialIn,
	): Promise<CredentialOut> {
		return this.updateCredentialUseCase.execute(authUser.userId, id, body);
	}

	/** DELETE /credentials/:id — removes it. */
	@Delete(":id")
	@UseGuards(AuthGuard)
	async remove(@AuthUser() authUser: MinimalUser, @Param("id") id: string): Promise<{ status: "success" }> {
		await this.deleteCredentialUseCase.execute(authUser.userId, id);
		return { status: "success" };
	}

}
