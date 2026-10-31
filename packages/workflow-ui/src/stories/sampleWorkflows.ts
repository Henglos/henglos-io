import {
	AddActionToWorkflowComponent,
	AddComponentToWorkflow,
	AddConnectionToWorkflow,
	CreateWorkflow,
	getActionOutputs,
	LOGIC_COMPONENT_ID,
	LogicComponentSchema,
	type IActionRuntime,
	type IBoardSchema,
	type IComponentSchema,
	type IWorkflowRuntime,
} from "@henglosio/workflow";

// Workflows for the stories, built the way the studio builds them — through
// @henglosio/workflow's use cases — so the canvas draws what it really gets.

const Board: IBoardSchema = {
	name: "ESP32",
	description: "ESP32 DevKit",
	connection: { serial: { baudrates: [115200] } },
	pins: [
		{ gpio: 2, type: ["digital_in", "digital_out", "pwm"], displayName: "GPIO2" },
		{ gpio: 4, type: ["digital_in", "digital_out", "pwm"], displayName: "GPIO4" },
		{ gpio: 36, type: ["digital_in", "analog_in"], displayName: "GPIO36" },
	],
};

const Gpio: IComponentSchema = {
	displayName: "GPIO",
	description: "Reads or drives a digital pin.",
	actions: [
		{
			displayName: "Write",
			description: "Drives the pin high or low.",
			icon: "toggle-right",
			script: "src/write.py",
			configurations: [
				{ displayName: "Pin", description: "Board pin it drives.", type: "pin", from: "board", filterBy: ["digital_out"] },
				{ displayName: "Value", description: "High or low.", type: "toggle", defaultValue: true },
			],
		},
	],
	triggers: [
		{
			displayName: "Pin Trigger",
			description: "Runs its branch when a pin changes.",
			icon: "toggle-right",
			script: "src/pin_trigger.py",
			outputSchema: [{ name: "level", type: "bool", description: "The pin after the change." }],
			configurations: [
				{ displayName: "Pin", description: "The pin to watch.", type: "pin", from: "board", filterBy: ["digital_in"] },
			],
		},
	],
};

const Time: IComponentSchema = {
	displayName: "Time",
	description: "Waits and measures.",
	actions: [
		{
			displayName: "Delay",
			description: "Waits for Duration, then goes on.",
			icon: "timer",
			script: "src/delay.py",
			outputSchema: [{ name: "duration", type: "int", description: "The time waited, in ms." }],
			configurations: [
				{ displayName: "Duration", description: "How long to wait.", type: "number", defaultValue: "1000" },
			],
		},
	],
};

const Sensor: IComponentSchema = {
	displayName: "Water Sensor",
	description: "An analog water level sensor.",
	actions: [
		{
			displayName: "Read",
			description: "How much of it is under water.",
			icon: "droplets",
			script: "src/read.py",
			outputSchema: [
				{ name: "level", type: "float", description: "0 to 100 %." },
				{ name: "wet", type: "bool", description: "Whether it reached Threshold." },
			],
			configurations: [
				{ displayName: "Signal Pin", description: "Board pin wired to S.", type: "pin", from: "board", filterBy: ["analog_in"] },
				{ displayName: "Threshold", description: "The level it counts as wet from, in %.", type: "number", defaultValue: "10" },
			],
		},
	],
};

const Http: IComponentSchema = {
	displayName: "HTTP",
	description: "Requests and a server.",
	// Needs the board's Wi-Fi — on a board without it, its nodes say so.
	capabilities: ["wifi"],
	actions: [
		{
			displayName: "Request",
			description: "Sends a request.",
			icon: "globe",
			script: "src/request.py",
			configurations: [
				{ displayName: "URL", description: "Where to send it.", type: "string", required: true },
			],
		},
	],
};

/** A workflow being built: add components and nodes, place and wire them. */
class Builder {
	workflow: IWorkflowRuntime;

	constructor(board: IBoardSchema = Board) {
		this.workflow = new CreateWorkflow().execute("Story", "A workflow for the stories", board, "board-package");
	}

	private components = new Map<string, string>();

	component(schema: IComponentSchema): this {
		const added = new AddComponentToWorkflow().execute(this.workflow, schema, schema.displayName.toLowerCase());
		this.workflow = added.workflow;
		this.components.set(schema.displayName, added.component.id);
		return this;
	}

	node(componentName: string, nodeName: string, at: { x: number; y: number }): IActionRuntime {
		const componentId = componentName === "Logic" ? LOGIC_COMPONENT_ID : this.components.get(componentName)!;
		const schemas = componentName === "Logic" ? LogicComponentSchema : [...this.workflow.components].find(component => component.id === componentId)!.base;
		const schema = schemas.actions?.find(action => action.displayName === nodeName) ?? schemas.triggers?.find(trigger => trigger.displayName === nodeName);
		const result = new AddActionToWorkflowComponent().execute(this.workflow, componentId, schema!);
		const action = { ...result.action!, x: at.x, y: at.y };
		this.workflow = {
			...result.workflow,
			components: result.workflow.components.map(component => ({
				...component,
				actions: component.actions.map(found => found.id === action.id ? action : found),
			})),
		};
		return action;
	}

	/** Changes a node (its configs, disabled…) after it's placed. */
	edit(node: IActionRuntime, change: (action: IActionRuntime) => IActionRuntime): IActionRuntime {
		let edited = node;
		this.workflow = {
			...this.workflow,
			components: this.workflow.components.map(component => ({
				...component,
				actions: component.actions.map(found => found.id === node.id ? (edited = change(found)) : found),
			})),
		};
		return edited;
	}

	start(at: { x: number; y: number }): IActionRuntime {
		this.workflow = { ...this.workflow, start: { ...this.workflow.start, x: at.x, y: at.y } };
		return this.workflow.start;
	}

	/** Wires `source`'s output (its first one, or the one named `output`) to `target`. */
	wire(source: IActionRuntime, target: IActionRuntime, output?: string): this {
		const outputs = source.id === this.workflow.start.id ? source.outputs : getActionOutputs(source);
		const handle = (output ? outputs.find(found => found.base.name === output) : outputs[0])!;
		this.workflow = new AddConnectionToWorkflow().execute(this.workflow, source.id, target.id, handle.id, target.inputs[0]?.id ?? "default").workflow;
		return this;
	}
}

/** Start → Write → Delay: a blink. */
export function blinkWorkflow(): IWorkflowRuntime {
	const flow = new Builder().component(Gpio).component(Time);
	const start = flow.start({ x: 0, y: 80 });
	const write = flow.node("GPIO", "Write", { x: 260, y: 40 });
	const delay = flow.node("Time", "Delay", { x: 560, y: 60 });
	return flow.wire(start, write).wire(write, delay).workflow;
}

/** A sensor read, an If on what it read, and a trigger running a branch of its own. */
export function branchingWorkflow(): IWorkflowRuntime {
	const flow = new Builder().component(Sensor).component(Gpio).component(Time);
	const start = flow.start({ x: 0, y: 100 });
	const read = flow.node("Water Sensor", "Read", { x: 260, y: 40 });
	const check = flow.node("Logic", "If", { x: 580, y: 40 });
	const alarm = flow.node("GPIO", "Write", { x: 900, y: -20 });
	const wait = flow.node("Time", "Delay", { x: 900, y: 260 });
	const trigger = flow.node("GPIO", "Pin Trigger", { x: 0, y: 460 });
	const reset = flow.node("GPIO", "Write", { x: 300, y: 440 });
	return flow
		.wire(start, read)
		.wire(read, check)
		.wire(check, alarm, "True")
		.wire(check, wait, "False")
		.wire(trigger, reset)
		.workflow;
}

/**
 * What a node shows besides its ports: a Switch whose ports say their cases,
 * a disabled node, a required config left empty, and a component the board
 * can't run (HTTP needs Wi-Fi, this board says it has none).
 */
export function statesWorkflow(): IWorkflowRuntime {
	const flow = new Builder({ ...Board, capabilities: [] }).component(Http).component(Gpio).component(Time);
	const start = flow.start({ x: 0, y: 120 });
	const route = flow.edit(flow.node("Logic", "Switch", { x: 260, y: 60 }), action => ({
		...action,
		configurations: action.configurations.map(config =>
			config.base.displayName === "Case 1" ? { ...config, value: "on" }
			: config.base.displayName === "Case 2" ? { ...config, value: "off" }
			: config),
	}));
	const on = flow.node("GPIO", "Write", { x: 600, y: -40 });
	const off = flow.edit(flow.node("Time", "Delay", { x: 600, y: 180 }), action => ({ ...action, disabled: true }));
	const request = flow.node("HTTP", "Request", { x: 600, y: 400 });
	return flow
		.wire(start, route)
		.wire(route, on, "Case 1")
		.wire(route, off, "Case 2")
		.wire(route, request, "Default")
		.workflow;
}
