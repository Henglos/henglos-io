import { Inject, Injectable } from "@nestjs/common";
import type { CredentialOut, UpdateCredentialIn } from "@henglosio/shared";
import type { ICredentialRepository } from "@/domain/repositories/ICredentialRepository.repo";
import { CredentialService } from "@/application/services/Credential.service";

/** Renames a credential and/or changes its values — a secret left out keeps what it was. */
@Injectable()
export class UpdateCredentialUseCase {

	constructor(
		@Inject("ICredentialRepository") private readonly credentialRepository: ICredentialRepository,
		private readonly credentialService: CredentialService,
	) {}

	async execute(userId: string, id: string, input: UpdateCredentialIn): Promise<CredentialOut> {
		const credential = await this.credentialService.own(userId, id);
		const type = await this.credentialService.type(userId, credential.type);
		const changes: { name?: string; data?: string } = {};
		if (input.name !== undefined) changes.name = input.name;
		if (input.fields !== undefined) {
			const values = this.credentialService.validate(type, this.credentialService.read(credential), input.fields);
			changes.data = this.credentialService.seal(values);
		}
		return this.credentialService.toOut(await this.credentialRepository.update(id, changes), type);
	}

}
