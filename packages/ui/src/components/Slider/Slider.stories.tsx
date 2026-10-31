import type { Meta, StoryObj } from "@storybook/react-vite";
import { Slider } from "./index";

const meta: Meta = {
	title: "Components/Slider",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const Default: StoryObj = {
	render: () => (
		<div className="w-64 flex flex-col gap-6">
			<Slider.Root defaultValue={40} min={0} max={100} step={1} label="Volume" />
			<Slider.Range
				defaultValue={[20, 80]}
				labels={["Min", "Max"]}
				min={0}
				max={100}
				step={5}
			/>
		</div>
	),
};
