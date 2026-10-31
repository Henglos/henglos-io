/** How big this installation is — counts only, for the anonymous telemetry. */
export type InstanceStats = {
	users: number;
	workflows: number;
	drivers: number;
	/** Distinct packages in libraries (any version), by kind. */
	boards: number;
	components: number;
	/** The component packages the workflows use, by package spec — how many workflows each is in. */
	componentUsage: Record<string, number>;
	/** The platform versions the workflows are on — how many workflows each. */
	platforms: Record<string, number>;
};

/** Counts across the whole installation. */
export interface IStatsRepository {

	/** This installation's stats, counted now. */
	instance(): Promise<InstanceStats>;

}
