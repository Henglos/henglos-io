import { injectable } from "tsyringe";
import { ReplTerminalsService } from "../../services/ReplTerminals.service.js";

/** What's typed in a REPL terminal, as it is — keys, Ctrl-C, a paste. */
@injectable()
export class WriteReplTerminalUseCase {

	constructor(private readonly replTerminals: ReplTerminalsService) {}

	execute(taskId: string, data: Uint8Array): void {
		this.replTerminals.terminals.get(taskId)?.write(Buffer.from(data));
	}

}
