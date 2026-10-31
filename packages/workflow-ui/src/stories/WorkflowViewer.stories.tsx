import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkflowViewer } from "../components/WorkflowViewer";
import { blinkWorkflow, branchingWorkflow, statesWorkflow } from "./sampleWorkflows";

/**
 * The studio's canvas, read-only — what docs and previews embed. Click a node
 * for its details.
 */
const meta = {
	title: "Canvas/WorkflowViewer",
	component: WorkflowViewer,
	args: {
		workflow: blinkWorkflow(),
		details: true,
		minimap: false,
		zoomOnScroll: true,
		draggable: true,
	},
	argTypes: {
		workflow: { control: false },
	},
} satisfies Meta<typeof WorkflowViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Start → GPIO Write → Delay. */
export const Blink: Story = {};

/** A Read, an If on it (True / False), and a Pin Trigger with a branch of its own. */
export const Branching: Story = {
	args: { workflow: branchingWorkflow() },
};

/**
 * What a node says about itself: a Switch's ports with their cases, a disabled
 * node (dashed, faded, struck through), a required config left empty (!) and
 * a component the board can't run (⊘ — HTTP needs Wi-Fi).
 */
export const States: Story = {
	args: { workflow: statesWorkflow() },
};

/** With the minimap. */
export const WithMinimap: Story = {
	args: { workflow: branchingWorkflow(), minimap: true },
};

/** Nodes only — clicking one shows no details panel. */
export const WithoutDetails: Story = {
	args: { workflow: branchingWorkflow(), details: false },
};
