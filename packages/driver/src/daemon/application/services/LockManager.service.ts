import { injectable } from "tsyringe";
import { ResourceBusy } from "../errors/Lock.error.js";

/**
 * Named, non-blocking mutex. A task grabs every key it needs in one call — if
 * any of them is already held, it fails immediately with `ResourceBusy` rather
 * than waiting: there's no queue here, an operation either starts now or the
 * caller finds out right away that something else has the resource.
 */
@injectable()
export class LockManager {

	private readonly held = new Set<string>();

	acquire(keys: string[]): () => void {
		const sorted = [...new Set(keys)].sort();

		const busyKey = sorted.find(key => this.held.has(key));
		if (busyKey) throw new ResourceBusy(busyKey);

		for (const key of sorted) this.held.add(key);

		let released = false;
		return () => {
			if (released) return;
			released = true;
			for (const key of sorted) this.held.delete(key);
		};
	}

}
