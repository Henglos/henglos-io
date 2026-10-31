// Builds the example workflows the docs show (content/workflows/*.json) with
// @henglosio/workflow's own use cases, from the real packages' manifests — so
// they're exactly what the studio would make. Run after changing a manifest:
//   pnpm --filter site examples
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
	AddActionToWorkflowComponent,
	AddComponentToWorkflow,
	AddConnectionToWorkflow,
	BindWorkflowActionConfigurationOutput,
	CreateWorkflow,
	UpdateWorkflowActionConfiguration,
	getActionOutputs,
	LOGIC_COMPONENT_ID,
	LogicComponentSchema,
	SetWorkflowActionPassContext,
	findNodeSchema,
} from "@henglosio/workflow";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../../..");
const out = path.resolve(here, "../content/workflows");

const yaml = (file) => parse(readFileSync(path.join(repo, file), "utf-8"));
// The board as the hosting keeps it: its schema, with the manifest's capabilities (wifi, bluetooth).
const boardManifest = yaml("packages/packages/boards/Esp32/workspace/manifest.yaml");
const board = {
	...yaml("packages/packages/boards/Esp32/workspace/board.schema.yaml"),
	...(boardManifest.capabilities && { capabilities: boardManifest.capabilities }),
};
const gpio = yaml("packages/packages/components/GPIO/manifest.yaml").schema;

const pin = (gpioNumber) => {
	const found = board.pins.find((p) => p.gpio === gpioNumber);
	if (!found) throw new Error(`The ESP32 board has no GPIO ${gpioNumber}`);
	return found;
};

const configOf = (action, displayName) => action.configurations.find((c) => c.base.displayName === displayName).id;

// ── Button → LED (docs: Your first workflow) ─────────────────────────────────

function buttonLed() {
	let workflow = new CreateWorkflow().execute("Button → LED", "Mirrors a button on an LED.", board, "board");

	const added = new AddComponentToWorkflow().execute(workflow, gpio, "gpio");
	workflow = added.workflow;
	const componentId = added.component.id;

	const addAction = (name) => {
		const result = new AddActionToWorkflowComponent().execute(workflow, componentId, gpio.actions.find((a) => a.displayName === name));
		workflow = result.workflow;
		return result.action;
	};
	const read = addAction("Read");
	const write = addAction("Write");

	workflow = new UpdateWorkflowActionConfiguration().execute(workflow, componentId, read.id, configOf(read, "Pin"), pin(4));
	workflow = new UpdateWorkflowActionConfiguration().execute(workflow, componentId, write.id, configOf(write, "Pin"), pin(2));
	const connect = (source, target) => {
		const sourceHandle = (source.id === workflow.start.id ? source.outputs : getActionOutputs(source))[0].id;
		// The target's own input handle — "default" only when it declares none (what the node draws then).
		const targetHandle = target.inputs[0]?.id ?? "default";
		workflow = new AddConnectionToWorkflow().execute(workflow, source.id, target.id, sourceHandle, targetHandle).workflow;
	};
	connect(workflow.start, read);
	connect(read, write);

	// After the wires: a binding needs its source upstream.
	workflow = new BindWorkflowActionConfigurationOutput().execute(workflow, componentId, write.id, configOf(write, "Value"), read.id, "value");

	// Laid out left to right.
	const place = (action, x, y) => ({ ...action, x, y });
	workflow = {
		...workflow,
		start: place(workflow.start, 0, 40),
		components: workflow.components.map((component) => ({
			...component,
			actions: component.actions.map((action) => action.id === read.id ? place(action, 420, 0) : place(action, 840, 0)),
		})),
	};

	return workflow;
}

// ── A builder for the others ─────────────────────────────────────────────────

// A component's schema as the hosting keeps it: its manifest's `schema`, with
// dependences.capabilities in it (PackageRegistryService does the same).
const component = (folder) => {
	const manifest = yaml(`packages/packages/components/${folder}/manifest.yaml`);
	return { ...manifest.schema, ...(manifest.dependences?.capabilities && { capabilities: manifest.dependences.capabilities }) };
};

/** A workflow made step by step: components, nodes (placed), wires, configs and binds. */
class Flow {
	constructor(name, description) {
		this.workflow = new CreateWorkflow().execute(name, description, board, "board");
		this.components = new Map();
	}

	add(schema) {
		const added = new AddComponentToWorkflow().execute(this.workflow, schema, schema.displayName.toLowerCase());
		this.workflow = added.workflow;
		this.components.set(schema.displayName, added.component.id);
		return this;
	}

	/** A node of `componentName` ("Logic" for If / Switch / Repeat) at x, y. */
	node(componentName, name, x, y) {
		const logic = componentName === "Logic";
		const componentId = logic ? LOGIC_COMPONENT_ID : this.components.get(componentName);
		const owner = logic ? { base: LogicComponentSchema } : this.workflow.components.find((c) => c.id === componentId);
		const result = new AddActionToWorkflowComponent().execute(this.workflow, componentId, findNodeSchema(owner, name));
		this.workflow = result.workflow;
		this.place(result.action.id, x, y);
		return this.find(result.action.id);
	}

	find(id) {
		return id === this.workflow.start.id ? this.workflow.start : this.workflow.components.flatMap((c) => c.actions).find((a) => a.id === id);
	}

	place(id, x, y) {
		const at = (action) => (action.id === id ? { ...action, x, y } : action);
		this.workflow = { ...this.workflow, start: at(this.workflow.start), components: this.workflow.components.map((c) => ({ ...c, actions: c.actions.map(at) })) };
	}

	/** Start's Mode — "loop" or "once". */
	mode(value) {
		const config = this.workflow.start.configurations.find((c) => c.base.displayName.toLowerCase() === "mode");
		if (config) this.workflow = { ...this.workflow, start: { ...this.workflow.start, configurations: this.workflow.start.configurations.map((c) => (c.id === config.id ? { ...c, value } : c)) } };
		return this;
	}

	/** Wires `source`'s output named `output` (its first one by default) to `target`. */
	wire(source, target, output) {
		const from = this.find(source.id);
		const outputs = from.id === this.workflow.start.id ? from.outputs : getActionOutputs(from);
		const handle = output ? outputs.find((o) => o.base.name === output) : outputs[0];
		const to = this.find(target.id);
		this.workflow = new AddConnectionToWorkflow().execute(this.workflow, from.id, to.id, handle.id, to.inputs[0]?.id ?? "default").workflow;
		return this;
	}

	set(node, configName, value) {
		this.workflow = new UpdateWorkflowActionConfiguration().execute(this.workflow, node.componentId, node.id, configOf(this.find(node.id), configName), value);
		return this;
	}

	bind(node, configName, source, output) {
		this.workflow = new BindWorkflowActionConfigurationOutput().execute(this.workflow, node.componentId, node.id, configOf(this.find(node.id), configName), source.id, output);
		return this;
	}

	/** Pass Context on — what reached `node` reaches the actions after it too. */
	passContext(node) {
		this.workflow = new SetWorkflowActionPassContext().execute(this.workflow, node.componentId, node.id, true);
		return this;
	}
}

// ── Triggers (docs: Triggers) ────────────────────────────────────────────────
// Start connects the WiFi once; then two triggers each run a branch of their
// own: a request on /led drives the LED and is answered, and a Timer blinks
// another one every second.

function triggers() {
	const flow = new Flow("Triggers", "A request on /led and a timer, each running its own branch.")
		.add(component("WiFi")).add(component("HTTP")).add(component("GPIO")).add(component("Time"))
		.mode("once");
	flow.place(flow.workflow.start.id, 0, 40);
	const connect = flow.node("WiFi", "Connect", 380, 0);
	const request = flow.node("HTTP", "Request Trigger", 0, 340);
	const led = flow.node("GPIO", "Write", 380, 320);
	const respond = flow.node("HTTP", "Respond", 760, 320);
	const timer = flow.node("Time", "Timer Trigger", 0, 640);
	const blink = flow.node("GPIO", "Write", 380, 620);
	return flow
		.set(request, "Path", "/led")
		.set(led, "Pin", pin(2))
		.set(blink, "Pin", pin(4))
		.set(timer, "Interval", "1000")
		.wire(flow.workflow.start, connect)
		.wire(request, led)
		.wire(led, respond)
		.wire(timer, blink)
		.workflow;
}

// ── Water alarm (docs: Components) ───────────────────────────────────────────
// Start reads the water sensor in a loop; an If on `wet` sounds the alarm (a
// GPIO pin) or waits a second; a button (Pin Trigger) silences it.

function waterAlarm() {
	const flow = new Flow("Water alarm", "A leak sounds the alarm; a button silences it.")
		.add(component("WaterSensor")).add(component("GPIO")).add(component("Time"));
	flow.place(flow.workflow.start.id, 0, 60);
	const read = flow.node("Water Sensor", "Read", 360, 0);
	const check = flow.node("Logic", "If", 720, 0);
	const alarm = flow.node("GPIO", "Write", 1080, -80);
	const wait = flow.node("Time", "Delay", 1080, 220);
	const button = flow.node("GPIO", "Pin Trigger", 0, 460);
	const silence = flow.node("GPIO", "Write", 360, 460);
	flow
		.wire(flow.workflow.start, read)
		.wire(read, check)
		.wire(check, alarm, "True")
		.wire(check, wait, "False")
		.wire(button, silence)
		.set(alarm, "Pin", pin(2))
		.set(silence, "Pin", pin(2))
		.set(silence, "Value", false)
		.set(button, "Pin", pin(4))
		.set(button, "Pull", "up")
		.set(check, "Condition", "is_true")
		.set(wait, "Duration", "1000");
	return flow.bind(check, "Value", read, "wet").workflow;
}

// ── Climate (landing) ────────────────────────────────────────────────────────
// Start reads the DHT in a loop and prints the temperature on the OLED (Pass
// Context on, so the reading still reaches the If); past 30 °C a fan runs at
// full speed, under it the fan stops.

function climate() {
	const flow = new Flow("Climate", "Shows the temperature, and runs a fan when it's hot.")
		.add(component("DHT")).add(component("Display")).add(component("PWM"));
	flow.place(flow.workflow.start.id, 0, 80);
	const read = flow.node("DHT", "Read", 360, 40);
	const print = flow.node("Display", "Print", 720, 40);
	const hot = flow.node("Logic", "If", 1080, 40);
	const fanOn = flow.node("PWM", "Write", 1440, -100);
	const fanOff = flow.node("PWM", "Write", 1440, 220);
	flow
		.wire(flow.workflow.start, read)
		.wire(read, print)
		.wire(print, hot)
		.wire(hot, fanOn, "True")
		.wire(hot, fanOff, "False")
		.passContext(print)
		.set(read, "Model", "dht22")
		.set(print, "Format", "Temp: {} C")
		.set(print, "Decimals", "1")
		.set(hot, "Condition", "gt")
		.set(hot, "Compare to", "30")
		.set(fanOn, "Pin", pin(18))
		.set(fanOn, "Duty", "100")
		.set(fanOn, "Frequency", "25000")
		.set(fanOff, "Pin", pin(18))
		.set(fanOff, "Duty", "0")
		.set(fanOff, "Frequency", "25000");
	return flow.bind(print, "Text", read, "temperature").bind(hot, "Value", read, "temperature").workflow;
}

// ── Web API (landing) ────────────────────────────────────────────────────────
// Start joins the Wi-Fi once; a Request Trigger on /led routes its subpath with
// a Switch: /on and /off drive the LED and answer 200, anything else 404.

function webApi() {
	const flow = new Flow("Web API", "/led/on and /led/off drive an LED; anything else is a 404.")
		.add(component("WiFi")).add(component("HTTP")).add(component("GPIO"))
		.mode("once");
	flow.place(flow.workflow.start.id, 0, 40);
	const connect = flow.node("WiFi", "Connect", 360, 0);
	const request = flow.node("HTTP", "Request Trigger", 0, 340);
	const route = flow.node("Logic", "Switch", 360, 320);
	const on = flow.node("GPIO", "Write", 760, 180);
	const off = flow.node("GPIO", "Write", 760, 420);
	const ok = flow.node("HTTP", "Respond", 1140, 300);
	const missing = flow.node("HTTP", "Respond", 760, 680);
	flow
		.wire(flow.workflow.start, connect)
		.wire(request, route)
		.wire(route, on, "Case 1")
		.wire(route, off, "Case 2")
		.wire(route, missing, "Default")
		.wire(on, ok)
		.wire(off, ok)
		.set(request, "Path", "/led")
		.set(route, "Case 1", "/on")
		.set(route, "Case 2", "/off")
		.set(on, "Pin", pin(2))
		.set(on, "Value", true)
		.set(off, "Pin", pin(2))
		.set(off, "Value", false)
		.set(ok, "Body", "ok")
		.set(missing, "Status", "404")
		.set(missing, "Body", "no such route");
	return flow.bind(route, "Value", request, "subpath").workflow;
}

// ── Servo sweep (landing) ────────────────────────────────────────────────────
// A Repeat sweeps a servo 0° → 180° three times — the loop wired back into it,
// routed round below the row on its own — then fades an LED in to say it's done.

function servoSweep() {
	const flow = new Flow("Servo sweep", "Sweeps a servo three times, then fades an LED in.")
		.add(component("Servo")).add(component("Time")).add(component("PWM"))
		.mode("once");
	flow.place(flow.workflow.start.id, 0, 140);
	const repeat = flow.node("Logic", "Repeat", 360, 140);
	const left = flow.node("Servo", "To Angle", 720, 120);
	const waitLeft = flow.node("Time", "Delay", 1080, 120);
	const right = flow.node("Servo", "To Angle", 1440, 120);
	const waitRight = flow.node("Time", "Delay", 1800, 120);
	const done = flow.node("PWM", "Fade", 720, -120);
	flow
		.wire(flow.workflow.start, repeat)
		.wire(repeat, left, "Loop")
		.wire(left, waitLeft)
		.wire(waitLeft, right)
		.wire(right, waitRight)
		.wire(waitRight, repeat)
		.wire(repeat, done, "Done")
		.set(repeat, "Times", "3")
		.set(left, "Signal Pin", pin(13))
		.set(left, "Angle", "0")
		.set(right, "Signal Pin", pin(13))
		.set(right, "Angle", "180")
		.set(waitLeft, "Duration", "600")
		.set(waitRight, "Duration", "600")
		.set(done, "Pin", pin(2))
		.set(done, "To", "100")
		.set(done, "Duration", "1500");
	return flow.workflow;
}

mkdirSync(out, { recursive: true });
for (const [name, build] of [["button-led", buttonLed], ["triggers", triggers], ["water-alarm", waterAlarm], ["climate", climate], ["web-api", webApi], ["servo-sweep", servoSweep]]) {
	writeFileSync(path.join(out, `${name}.json`), JSON.stringify(build(), null, "\t") + "\n");
	console.log(`content/workflows/${name}.json`);
}
