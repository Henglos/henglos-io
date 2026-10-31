import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "./index";

const meta: Meta = {
	title: "Components/Checkbox",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const Default: StoryObj = {
	render: () => (
		<div className="flex flex-col gap-4">
			<Checkbox.Root />
			<Checkbox.Root defaultChecked />
			<Checkbox.Root disabled />
		</div>
	),
};
