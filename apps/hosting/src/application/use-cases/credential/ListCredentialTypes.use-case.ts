import { Injectable } from "@nestjs/common";
import type { CredentialTypeOut } from "@henglosio/shared";
import { CredentialService } from "@/application/services/Credential.service";

/** The kinds of credential there are — what the user's installed components declare. */
@Injectable()
export class ListCredentialTypesUseCase {

	constructor(private readonly credentialService: CredentialService) {}

	async execute(userId: string): Promise<CredentialTypeOut[]> {
		return this.credentialService.types(userId);
	}

}
