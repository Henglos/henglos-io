import type { IBoardRuntime } from "../../../domain/entities/IBoard.runtime.js";
import type { IBoardConnectionState } from "../../../domain/entities/IBoard.schema.js";

/** How the driver talks to the board: its serial port and baud rate. */
export class SetBoardConnection {
	execute(board: IBoardRuntime, connection: IBoardConnectionState): IBoardRuntime {
		return { ...board, connection };
	}
}
