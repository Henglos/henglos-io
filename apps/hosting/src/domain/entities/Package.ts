import type { IBoardSchema, IComponentSchema } from '@henglosio/workflow';

type PackageCreateInput = {
	spec: string;
	name: string;
	version: string;
	author: string;
	description: string;
	type: 'board' | 'component';
	schema: IBoardSchema | IComponentSchema;
	registry: string;
	platform: string;
};

/**
 * One version of a board or component package, as read from its registry.
 * Stored once and shared by every user who installs it (see AccountPackage) —
 * versions are immutable, so a new version is a new Package.
 */
export class Package {
	constructor(
		public readonly id: string | null,
		/** Its name in the studio — the manifest's `name`. */
		public readonly name: string,
		/** Its npm name, e.g. `@henglosio/component-gpio`. */
		public readonly spec: string,
		public readonly version: string,
		public readonly author: string,
		public readonly description: string,
		public readonly type: 'board' | 'component',
		/** What the studio builds the board or the component's nodes from. */
		public readonly schema: IBoardSchema | IComponentSchema,
		/** The registry it came from. */
		public readonly registry: string,
		/** The platform versions it works with — its manifest's `dependences.platform`. */
		public readonly platform: string,
	) {}

	/** A package version read from a registry, not saved yet (no id). */
	public static create(input: PackageCreateInput) {
		return new Package(
			null,
			input.name,
			input.spec,
			input.version,
			input.author,
			input.description,
			input.type,
			input.schema,
			input.registry,
			input.platform
		);
	}
}
