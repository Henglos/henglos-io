import type { Meta, StoryObj } from "@storybook/react-vite";
import { Radio } from "./index";

const meta: Meta = {
	title: "Components/Radio",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const Default: StoryObj = {
	render: () => (
		<div className="flex flex-col gap-4">
			<Radio.Root />
			<Radio.Root defaultChecked />
			<Radio.Root disabled />
		</div>
	),
};
