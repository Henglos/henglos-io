import { TaskContext } from "@/daemon/domain/entities/TaskContext.js";
import { injectable } from "tsyringe";

@injectable()
class ReadFileUseCase {

	constructor() { }

	async execute(port: string, path: string, ctx: TaskContext) {

		
	}
	
}
