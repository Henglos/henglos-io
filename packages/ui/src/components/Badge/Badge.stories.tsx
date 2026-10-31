import type { Meta, StoryObj } from "@storybook/react-vite";
import { CircleDot, Tag, Zap } from "lucide-react";
import { Badge } from "./index";

const meta: Meta<typeof Badge> = {
	title: "Components/Badge",
	component: Badge,
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const Default: Story = {
	args: {
		children: "Badge",
		variant: "default",
	},
};

export const AllVariants: Story = {
	render: () => (
		<div className="flex flex-wrap gap-2 items-center">
			<Badge variant="default">Default</Badge>
			<Badge variant="success">Success</Badge>
			<Badge variant="warning">Warning</Badge>
			<Badge variant="error">Error</Badge>
			<Badge variant="info">Info</Badge>
		</div>
	),
};

export const WithIcon: Story = {
	render: () => (
		<div className="flex flex-wrap gap-2 items-center">
			<Badge variant="default"><Tag size={10} />Default</Badge>
			<Badge variant="success"><Zap size={10} />Success</Badge>
			<Badge variant="warning"><CircleDot size={10} />Warning</Badge>
			<Badge variant="error"><CircleDot size={10} />Error</Badge>
			<Badge variant="info"><CircleDot size={10} />Info</Badge>
		</div>
	),
};

export const UsageExamples: Story = {
	render: () => (
		<div className="flex flex-col gap-4 items-start">
			<div className="flex items-center gap-2">
				<span className="text-xs text-fg-secondary">Workflow status</span>
				<Badge variant="success">Running</Badge>
			</div>
			<div className="flex items-center gap-2">
				<span className="text-xs text-fg-secondary">Build</span>
				<Badge variant="error">Failed</Badge>
			</div>
			<div className="flex items-center gap-2">
				<span className="text-xs text-fg-secondary">Deploy</span>
				<Badge variant="warning">Pending</Badge>
			</div>
			<div className="flex items-center gap-2">
				<span className="text-xs text-fg-secondary">Version</span>
				<Badge variant="info">v2.4.1</Badge>
			</div>
			<div className="flex items-center gap-2">
				<span className="text-xs text-fg-secondary">Stage</span>
				<Badge variant="default">Draft</Badge>
			</div>
		</div>
	),
};
