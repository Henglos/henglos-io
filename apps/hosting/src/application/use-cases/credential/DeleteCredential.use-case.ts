import { Inject, Injectable } from "@nestjs/common";
import type { ICredentialRepository } from "@/domain/repositories/ICredentialRepository.repo";
import { CredentialService } from "@/application/services/Credential.service";

/** Removes a credential — a workflow that used it asks for another one next session. */
@Injectable()
export class DeleteCredentialUseCase {

	constructor(
		@Inject("ICredentialRepository") private readonly credentialRepository: ICredentialRepository,
		private readonly credentialService: CredentialService,
	) {}

	async execute(userId: string, id: string): Promise<void> {
		await this.credentialService.own(userId, id);
		await this.credentialRepository.delete(id);
	}

}
