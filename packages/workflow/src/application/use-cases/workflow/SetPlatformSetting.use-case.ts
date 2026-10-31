import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";

/**
 * Overrides one of the platform's runtime limits for this workflow, or — with
 * `value` null — drops the override, back to the platform's default. Which
 * keys exist and their ranges belong to the platform version (its manifest's
 * `settings`): the studio checks them, and the platform's build checks again.
 */
export class SetPlatformSetting {
	execute(workflow: IWorkflowRuntime, key: string, value: number | null): IWorkflowRuntime {
		const { [key]: _previous, ...rest } = workflow.platformSettings ?? {};
		const platformSettings = value === null ? rest : { ...rest, [key]: value };
		if (Object.keys(platformSettings).length === 0) {
			const { platformSettings: _dropped, ...withoutSettings } = workflow;
			return withoutSettings;
		}
		return { ...workflow, platformSettings };
	}
}
