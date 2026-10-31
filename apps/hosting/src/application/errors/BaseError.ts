
/**
 * The base of every error the hosting reports to a client on purpose. The
 * exception interceptor turns one into an HTTP response: `code` as the status,
 * `{ id, info }` as the body. Anything thrown that isn't a BaseError is an
 * unexpected failure, reported as a generic internal error.
 */
export class BaseError extends Error {

	constructor(
		/** The HTTP status to answer with. */
		public readonly code: number,
		/** What went wrong, as a stable snake_case id — what the studio tells errors apart by. */
		public readonly id: string,
		/** Details, when there are any worth showing (which field, which package…). */
		private readonly info?: string,
	) {
		super(id);

		Object.setPrototypeOf(this, BaseError.prototype);

	}

	/** The response body: `{ id, info }`. */
	toResponseString() {
		return {
			id: this.id,
			info: this.info
		};
	}

}
