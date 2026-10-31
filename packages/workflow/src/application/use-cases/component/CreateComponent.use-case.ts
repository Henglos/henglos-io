import { v4 } from "uuid";
import type { IComponentSchema } from "../../../domain/entities/IComponent.schema.js";
import type { IComponentRuntime } from "../../../domain/entities/IComponent.runtime.js";

/** A component of the workflow from a component package's schema — no nodes yet. */
export class CreateComponent {
	execute(base: IComponentSchema, packageId: string, alias?: string): IComponentRuntime {
		return {
			id: v4(),
			packageId,
			alias: alias ?? base.displayName,
			base,
			actions: [],
		};
	}
}
