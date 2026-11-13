import { SerialPort } from "serialport";
import { injectable } from "tsyringe";

/** The open REPL terminals, by task — what the terminal's use cases share. */
@injectable()
export class ReplTerminalsService {

	readonly terminals = new Map<string, SerialPort>();

}
