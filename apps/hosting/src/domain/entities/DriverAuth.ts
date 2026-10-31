
/**
 * The connected driver, as a request knows it: which driver it is and whose,
 * from its access token.
 */
export class DriverAuth {

	constructor(
		/** The driver's id. */
		public readonly id: string,
		public readonly userId: string,
		public readonly deviceHWID: string,
		public readonly deviceUser: string,
		public readonly deviceName: string,
	) {}

}
