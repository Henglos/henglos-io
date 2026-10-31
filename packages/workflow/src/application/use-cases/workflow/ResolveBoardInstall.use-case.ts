import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IFileValueSchema } from "../../../domain/entities/IConfiguration.schema.js";
import { isCoreComponent } from "../../../domain/value-objects/LogicComponent.js";
import { withoutDisabledActions } from "./WithoutDisabledActions.js";
import { isFileValue } from "./WorkflowFileValues.js";
import { isCredentialValue } from "./WorkflowCredentialValues.js";
import { findNodeSchema } from "./AddActionToComponent.use-case.js";

// What a board needs installed to run a workflow — only what's on the canvas:
// the components with at least one action there, and of those only the
// actions used (Display has nine, a workflow may use one). The driver adds
// what those actions' scripts import, compiles them and syncs the board's
// /components with it when a session starts (Play, Run, Debug, Record) —
// see the driver's BoardInstaller. Plus the files attached to configs, and
// the credentials picked in them (their values written by the hosting).
//
// Built-ins (Logic, Variables) have nothing to install: the runtime handles
// them. Disabled actions don't run, so they aren't installed either.

/** A display name as a Python module name — the board's ComponentLoader rule (lowercased, [^a-z0-9_] -> "_"). */
export const boardModuleName = (text: string) => text.toLowerCase().replace(/[^a-z0-9_]/g, "_");

/** Where an attached file lives on the board: content-addressed, so the same file attached twice is one file there. */
export const fileBoardPath = (file: Pick<IFileValueSchema, "sha256" | "name">): string => {
	const dot = file.name.lastIndexOf(".");
	const extension = dot > 0 ? file.name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 8) : "";
	return `/files/${file.sha256.slice(0, 12)}${extension}`;
};

/**
 * Where a credential's values live on the board while a workflow uses it —
 * by its id, so editing the credential rewrites the same file. JSON, its
 * fields by name. Fits a config value (64 B) as text.
 */
export const credentialBoardPath = (credentialId: string): string => `/secrets/${credentialId}.json`;

/** A component whose actions the workflow uses, and where they go on the board. */
export type BoardInstallComponent = {
	/** workflow.components[].packageId — the hosting turns it into name@version. */
	packageId: string;
	displayName: string;
	/** Its folder on the board: /components/<module>. */
	module: string;
	/** The actions used — each once, however many nodes it has. */
	actions: { displayName: string; module: string; script: string }[];
};

/** A file a config attaches, and where it goes on the board. */
export type BoardInstallFile = { fileId: string; sha256: string; path: string };

/** A credential the configs pick — the hosting writes its values to `path`. */
export type BoardInstallCredential = { credentialId: string; path: string };

/** What a session puts on the board before it runs (see ResolveBoardInstall). */
export type BoardInstall = { components: BoardInstallComponent[]; files: BoardInstallFile[]; credentials: BoardInstallCredential[] };

/**
 * What the board needs to run the workflow: the components' actions its nodes use (each once),
 * the files its configs attach and the credentials they pick — disabled nodes left out.
 */
export class ResolveBoardInstall {

	execute(workflow: IWorkflowRuntime): BoardInstall {

		const runnable = withoutDisabledActions(workflow);
		const components: BoardInstallComponent[] = [];
		const files = new Map<string, BoardInstallFile>();

		for (const component of runnable.components) {
			if (isCoreComponent(component) || component.actions.length === 0) continue;

			const actions = new Map<string, BoardInstallComponent["actions"][number]>();
			for (const action of component.actions) {
				const schema = findNodeSchema(component, action.base.displayName) ?? action.base;
				if (!schema.script || actions.has(schema.displayName)) continue;
				actions.set(schema.displayName, { displayName: schema.displayName, module: boardModuleName(schema.displayName), script: schema.script });
			}
			if (actions.size === 0) continue;

			components.push({
				packageId: component.packageId,
				displayName: component.base.displayName,
				module: boardModuleName(component.base.displayName),
				actions: [...actions.values()],
			});
		}

		// Files attached to, and credentials picked in, the configs of any action
		// that runs (the board's own too).
		const credentials = new Map<string, BoardInstallCredential>();
		const actions = [...runnable.board.actions, ...runnable.components.flatMap(component => component.actions)];
		for (const action of actions) {
			for (const config of action.configurations) {
				if (config.base.type === "file" && isFileValue(config.value)) {
					const path = fileBoardPath(config.value);
					files.set(path, { fileId: config.value.fileId, sha256: config.value.sha256, path });
				}
				if (config.base.type === "credential" && isCredentialValue(config.value)) {
					const { credentialId } = config.value;
					credentials.set(credentialId, { credentialId, path: credentialBoardPath(credentialId) });
				}
			}
		}

		return { components, files: [...files.values()], credentials: [...credentials.values()] };

	}

}
