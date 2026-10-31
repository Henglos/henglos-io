
/**
 * An error the driver reports on purpose: `id` is what the hosting and the studio tell it
 * apart by (e.g. "resource_busy"), the message says it to a person.
 */
export class BaseError extends Error {

	constructor(
		public readonly id: string, 
		msg: string
	) {
		super(msg)
	}

}
