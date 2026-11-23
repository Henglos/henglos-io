import { describe, expect, it } from "vitest";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";
import type { IConfigurationSchema } from "../../../domain/entities/IConfiguration.schema.js";
import { ConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";
import { LOGIC_COMPONENT_ID, LogicComponentSchema } from "../../../domain/value-objects/LogicComponent.js";
import { CreateWorkflow } from "./CreateWorkflow.use-case.js";
import { AddActionToWorkflowComponent } from "./AddActionToComponent.use-case.js";
import { migrateLegacyLogic } from "./MigrateLegacyLogic.js";

// The older shapes, as nodes made with them carry them.
const text = (displayName: string): IConfigurationSchema => ({ displayName, description: "", type: "string" });
const pick = (displayName: string, values: string[]): IConfigurationSchema => ({
	displayName, description: "", type: "options", options: values.map(value => ({ displayName: value, value })),
});
const conditions = ["eq", "ne", "gt", "gte", "lt", "lte", "contains", "is_true", "string:equals", "number:gt"];

const old = (base: IConfigurationSchema, value: unknown, binding: IConfigurationRuntime["binding"] = null): IConfigurationRuntime =>
	({ id: `old-${base.displayName}`, base, value: value as never, binding });

/** `name`'s node in a new workflow, carrying `configurations` (an older shape's) instead of its own. */
const withOlderNode = (name: "If" | "Switch", configurations: IConfigurationRuntime[], outputs?: string[]) => {
	let workflow: IWorkflowRuntime = new CreateWorkflow().execute("wf", "", { name: "esp32", displayName: "ESP32", description: "", pins: [] } as never, "board-pkg");
	workflow = { ...workflow, variables: [{ id: "v1", name: "mode", type: "string", initial: null }] };
	const added = new AddActionToWorkflowComponent().execute(workflow, LOGIC_COMPONENT_ID, LogicComponentSchema.actions!.find(action => action.displayName === name)!);
	const node = added.action!;
	const older: IActionRuntime = {
		...node,
		base: { ...node.base, configurations: configurations.map(config => config.base), ...(outputs ? { outputs: outputs.map(id => ({ id, name: id })) } : {}) },
		configurations,
		...(outputs ? { outputs: outputs.map(id => ({ id: `rt-${id}`, base: { id, name: id } })) } : {}),
	};
	return {
		id: node.id,
		workflow: { ...added.workflow, components: added.workflow.components.map(c => ({ ...c, actions: c.actions.map(a => a.id === node.id ? older : a) })) },
	};
};

const node = (workflow: IWorkflowRuntime, id: string) => workflow.components.flatMap(c => c.actions).find(a => a.id === id)!;
const strip = (value: unknown) => JSON.parse(JSON.stringify(value, (key, v) => key === "id" ? undefined : v));

describe("migrating If / Switch nodes of an older shape", () => {

	it("moves the first shape's If — and its second condition with OR — to Conditions, binds as {{ name }}", () => {
		const { workflow, id } = withOlderNode("If", [
			old(text("Value"), undefined, { actionId: "sensor", outputName: "temperature" }),
			old(pick("Condition", conditions), "gt"),
			old(text("Compare to"), "30"),
			old(pick("Combine", ["none", "and", "or"]), "or"),
			old(text("Value 2"), undefined, { variableId: "v1" }),
			old(pick("Condition 2", conditions), "is_true"),
			old(text("Compare to 2"), undefined, { code: "return 1" }),
		]);
		const migrated = node(migrateLegacyLogic(workflow), id);
		expect(migrated.configurations.map(c => c.base.displayName)).toEqual(["Conditions"]);
		expect(strip(migrated.configurations[0]!.value)).toEqual({
			combinator: "or",
			conditions: [
				{ leftValue: "{{ temperature }}", operator: "number:gt", rightValue: "30" },
				{ leftValue: "{{ mode }}", operator: "boolean:is_true", rightValue: "" },   // a script: left empty
			],
		});
		expect(ConfigurationRuntime.safeParse(migrated.configurations[0]).error?.issues).toBeUndefined();
	});

	it("moves an If of rows to Conditions", () => {
		const { workflow, id } = withOlderNode("If", [
			old(text("Condition 1 value"), "1"),
			old(pick("Condition 1 operation", conditions), "number:gt"),
			old(text("Condition 1 compare to"), "0"),
			old(text("Condition 2 value"), "a"),
			old(pick("Condition 2 operation", conditions), "string:equals"),
			old(text("Condition 2 compare to"), "b"),
			old(pick("Combine", ["and", "or"]), "and"),
		]);
		expect(strip(node(migrateLegacyLogic(workflow), id).configurations[0]!.value)).toEqual({
			combinator: "and",
			conditions: [
				{ leftValue: "1", operator: "number:gt", rightValue: "0" },
				{ leftValue: "a", operator: "string:equals", rightValue: "b" },
			],
		});
	});

	it("moves a Switch — of either shape — to Routing Rules, keeping its outputs and their ids", () => {
		const first = withOlderNode("Switch", [
			old(text("Value"), "x"),
			old(pick("Match", conditions), "eq"),
			old(text("Case 1"), "auto"),
			old(text("Case 2"), "manual"),
		], ["case_1", "case_2", "otherwise"]);
		const migrated = node(migrateLegacyLogic(first.workflow), first.id);
		expect(strip(migrated.configurations[0]!.value)).toEqual({ values: [
			{ conditions: { combinator: "and", conditions: [{ leftValue: "x", operator: "string:equals", rightValue: "auto" }] }, outputKey: "" },
			{ conditions: { combinator: "and", conditions: [{ leftValue: "x", operator: "string:equals", rightValue: "manual" }] }, outputKey: "" },
		] });
		expect(migrated.outputs.map(o => `${o.id}:${o.base.id}`)).toEqual(["rt-case_1:case_1", "rt-case_2:case_2", "rt-otherwise:otherwise"]);

		const rows = withOlderNode("Switch", [
			old(text("Case 1 value"), "{{ mode }}"),
			old(pick("Case 1 operation", conditions), "string:equals"),
			old(text("Case 1 compare to"), "auto"),
		], ["case_1", "otherwise"]);
		expect(strip(node(migrateLegacyLogic(rows.workflow), rows.id).configurations[0]!.value).values).toHaveLength(1);
	});

	it("gives the same workflow every time, and leaves today's nodes as they are", () => {
		const { workflow } = withOlderNode("If", [old(text("Value"), "1"), old(pick("Condition", conditions), "eq")]);
		const once = migrateLegacyLogic(workflow);
		expect(migrateLegacyLogic(workflow)).toEqual(once);
		expect(migrateLegacyLogic(once)).toBe(once);
	});

});
