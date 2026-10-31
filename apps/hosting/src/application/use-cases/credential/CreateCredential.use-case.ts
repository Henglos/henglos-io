import { Inject, Injectable } from "@nestjs/common";
import type { CreateCredentialIn, CredentialOut } from "@henglosio/shared";
import type { ICredentialRepository } from "@/domain/repositories/ICredentialRepository.repo";
import { CredentialService } from "@/application/services/Credential.service";

/** A new credential of a type an installed component declares — its values kept encrypted. */
@Injectable()
export class CreateCredentialUseCase {

	constructor(
		@Inject("ICredentialRepository") private readonly credentialRepository: ICredentialRepository,
		private readonly credentialService: CredentialService,
	) {}

	async execute(userId: string, input: CreateCredentialIn): Promise<CredentialOut> {
		const type = await this.credentialService.type(userId, input.type);
		const values = this.credentialService.validate(type, {}, input.fields);
		const credential = await this.credentialRepository.create({
			userId,
			type: type.name,
			name: input.name,
			data: this.credentialService.seal(values),
		});
		return this.credentialService.toOut(credential, type);
	}

}
