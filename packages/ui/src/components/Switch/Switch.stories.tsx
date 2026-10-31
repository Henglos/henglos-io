import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch } from "./index";

const meta: Meta = {
	title: "Components/Switch",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const Default: StoryObj = {
	render: () => (
		<div className="flex gap-4 items-center">
			<Switch.Root />
			<Switch.Root defaultChecked />
			<Switch.Root disabled />
		</div>
	),
};
