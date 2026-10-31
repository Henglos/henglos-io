import { Inject, Injectable } from "@nestjs/common";
import type { CredentialOut } from "@henglosio/shared";
import type { ICredentialRepository } from "@/domain/repositories/ICredentialRepository.repo";
import { CredentialService } from "@/application/services/Credential.service";

/** The user's credentials — a secret field only as set or not. */
@Injectable()
export class ListCredentialsUseCase {

	constructor(
		@Inject("ICredentialRepository") private readonly credentialRepository: ICredentialRepository,
		private readonly credentialService: CredentialService,
	) {}

	async execute(userId: string): Promise<CredentialOut[]> {
		const types = new Map((await this.credentialService.types(userId)).map(type => [type.name, type]));
		return (await this.credentialRepository.findByUser(userId))
			.map(credential => this.credentialService.toOut(credential, types.get(credential.type)));
	}

}
