import type { Meta, StoryObj } from "@storybook/react-vite";
import { Table } from "./index";

const meta: Meta = {
	title: "Components/Table",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const Default: StoryObj = {
	render: () => (
		<Table.Root className="w-80">
			<Table.Row>
				<span className="text-sm flex-1" style={{ color: "var(--fg)" }}>Workflow Alpha</span>
				<span className="text-xs" style={{ color: "var(--fg-muted)" }}>Running</span>
			</Table.Row>
			<Table.Row>
				<span className="text-sm flex-1" style={{ color: "var(--fg)" }}>Workflow Beta</span>
				<span className="text-xs" style={{ color: "var(--fg-muted)" }}>Stopped</span>
			</Table.Row>
			<Table.Row>
				<span className="text-sm flex-1" style={{ color: "var(--fg)" }}>Workflow Gamma</span>
				<span className="text-xs" style={{ color: "var(--fg-muted)" }}>Error</span>
			</Table.Row>
		</Table.Root>
	),
};
