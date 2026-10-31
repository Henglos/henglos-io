import type { Meta, StoryObj } from "@storybook/react-vite";
import { Progress } from "./index";

const meta: Meta = {
	title: "Components/Progress",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const Default: StoryObj = {
	render: () => (
		<div className="flex flex-col gap-4 w-64">
			<Progress.Root value={40} />
			<Progress.Root value={70} size="md" label="Upload" showValue />
			<Progress.Root value={100} label="Complete" showValue />
		</div>
	),
};
