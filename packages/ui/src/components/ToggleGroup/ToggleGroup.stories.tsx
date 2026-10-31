import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { ToggleGroup } from "./index";

const meta: Meta = {
	title: "Components/ToggleGroup",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const Default: StoryObj = {
	render: () => (
		<ToggleGroup.Root defaultValue="left">
			<ToggleGroup.Item value="left"><AlignLeft size={14} /></ToggleGroup.Item>
			<ToggleGroup.Item value="center"><AlignCenter size={14} /></ToggleGroup.Item>
			<ToggleGroup.Item value="right"><AlignRight size={14} /></ToggleGroup.Item>
		</ToggleGroup.Root>
	),
};
