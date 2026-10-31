import { v4 } from "uuid";
import type { IConnectionRuntime } from "../../../domain/entities/IConnection.runtime.js";

/** A new wire, from `source`'s output handle to `target`'s input handle. */
export class CreateConnection {
	execute(source: string, target: string, sourceHandle: string, targetHandle: string): IConnectionRuntime {
		return { id: v4(), source, target, sourceHandle, targetHandle };
	}
}
