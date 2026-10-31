import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Select, Text } from "@henglosio/ui";
import { getActionOutputs, type IWorkflowRuntime } from "@henglosio/workflow";
import { Play, Square, StepForward } from "lucide-react";
import { WorkflowViewer } from "../components/WorkflowViewer";
import { useDebugSimulation, type DebugValue } from "../debug/simulation";
import { branchingWorkflow, statesWorkflow } from "./sampleWorkflows";

// The studio's debug mode played on the viewer, by hand: useDebugSimulation
// holds the session, WorkflowViewer draws it (debug / onDebugContinue).

// What a node "publishes" when it runs here — made up, by output name.
const SAMPLE_VALUES: Record<string, DebugValue> = { level: 42.5, wet: true, duration: 1000, level_raw: 23011 };

const nodesOf = (workflow: IWorkflowRuntime) => [
	{ id: workflow.start.id, label: "Start", outputs: workflow.start.outputs.map(output => output.base.name) },
	...workflow.components.flatMap(component => component.actions.map(action => ({
		id: action.id,
		label: `${component.alias} › ${action.alias}`,
		outputs: getActionOutputs(action).map(output => output.base.name),
	}))),
];

const Playground: React.FC<{ make: () => IWorkflowRuntime }> = ({ make }) => {

	const workflow = useMemo(make, [make]);
	const debug = useDebugSimulation(workflow);
	const nodes = useMemo(() => nodesOf(workflow), [workflow]);
	const [output, setOutput] = useState("");
	const [picked, setPicked] = useState("");

	const nextNode = nodes.find(node => node.id === debug.state.nextId);
	// What the node that runs next publishes here (its declared outputs).
	const valuesFor = (id: string | null) => {
		const action = workflow.components.flatMap(component => component.actions).find(found => found.id === id);
		const names = (action?.base.outputSchema ?? []).map(entry => entry.name);
		return Object.fromEntries(names.map(name => [name, SAMPLE_VALUES[name] ?? 0]));
	};
	const next = () => {
		debug.next(output || undefined, valuesFor(debug.state.nextId));
		setOutput("");
	};

	return (
		<div className="relative h-full w-full">

			<WorkflowViewer workflow={workflow} debug={debug.state} onDebugContinue={next} zoomOnScroll />

			{/* The session's controls — the functions useDebugSimulation gives. */}
			<div className="absolute left-3 top-3 z-10 flex w-72 flex-col gap-3 rounded-lg border border-line bg-raised p-3 shadow-[0_8px_32px_rgb(0_0_0/0.35)]">

				<div className="flex items-center justify-between">
					<Text variant="high" size="sm">Debug</Text>
					<Text variant="low" size="xs" font="mono">{debug.state.status} · step {debug.state.step}</Text>
				</div>

				<div className="flex gap-1.5">
					<Button.Root size="sm" variant="surface" onClick={() => debug.start()}>
						<Button.Icon><Play size={12} /></Button.Icon>
						<Button.Label>Start</Button.Label>
					</Button.Root>
					<Button.Root size="sm" variant="primary" onClick={next} disabled={debug.state.status !== "paused"}>
						<Button.Icon><StepForward size={12} /></Button.Icon>
						<Button.Label>Next</Button.Label>
					</Button.Root>
					<Button.Root size="sm" variant="ghost" onClick={debug.stop} disabled={debug.state.status === "idle"} className="ml-auto">
						<Button.Icon><Square size={12} /></Button.Icon>
						<Button.Label>Stop</Button.Label>
					</Button.Root>
				</div>

				{nextNode && (
					<div className="flex flex-col gap-1">
						<Text variant="low" size="xs">{nextNode.label} ends on</Text>
						<Select.Root value={output || nextNode.outputs[0] || ""} onValueChange={setOutput}>
							<Select.Trigger placeholder="Its first output" className="h-8" />
							<Select.Content>
								{nextNode.outputs.map(name => <Select.Item key={name} value={name}>{name}</Select.Item>)}
							</Select.Content>
						</Select.Root>
					</div>
				)}

				<div className="flex flex-col gap-1">
					<Text variant="low" size="xs">Put the session on</Text>
					<Select.Root value={picked} onValueChange={setPicked}>
						<Select.Trigger placeholder="A node…" className="h-8" />
						<Select.Content>
							{nodes.map(node => <Select.Item key={node.id} value={node.id}>{node.label}</Select.Item>)}
						</Select.Content>
					</Select.Root>
					<div className="flex gap-1.5">
						<Button.Root size="sm" variant="surface" disabled={!picked} onClick={() => debug.select(picked)}>
							<Button.Label>As next</Button.Label>
						</Button.Root>
						<Button.Root size="sm" variant="surface" disabled={!picked} onClick={() => debug.select(picked, { as: "ran" })}>
							<Button.Label>As ran</Button.Label>
						</Button.Root>
					</div>
				</div>

			</div>

		</div>
	);

};

const meta = {
	title: "Canvas/Debug simulation",
	component: Playground,
	args: { make: branchingWorkflow },
	argTypes: { make: { control: false } },
} satisfies Meta<typeof Playground>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Start → Read → If (True / False) — and a Pin Trigger's own branch. Start, then Next or Continue. */
export const Branching: Story = {};

/** A Switch: pick which case it ends on, before Next. */
export const Switch: Story = { args: { make: statesWorkflow } };
