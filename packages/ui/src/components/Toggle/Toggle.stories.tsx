import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bold, Italic } from "lucide-react";
import { Toggle } from "./index";

const meta: Meta = {
	title: "Components/Toggle",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const Variants: StoryObj = {
	render: () => (
		<div className="flex gap-4 items-center">
			<Toggle.Root variant="ghost">
				<Toggle.Icon><Bold size={14} /></Toggle.Icon>
				<Toggle.Label>Ghost</Toggle.Label>
			</Toggle.Root>
			<Toggle.Root variant="surface">
				<Toggle.Icon><Italic size={14} /></Toggle.Icon>
				<Toggle.Label>Surface</Toggle.Label>
			</Toggle.Root>
		</div>
	),
};

export const Pressed: StoryObj = {
	render: () => (
		<div className="flex gap-4 items-center">
			<Toggle.Root pressed>
				<Toggle.Icon><Bold size={14} /></Toggle.Icon>
				<Toggle.Label>Pressed</Toggle.Label>
			</Toggle.Root>
			<Toggle.Root>
				<Toggle.Icon><Italic size={14} /></Toggle.Icon>
				<Toggle.Label>Unpressed</Toggle.Label>
			</Toggle.Root>
		</div>
	),
};

export const IconOnly: StoryObj = {
	render: () => (
		<div className="flex gap-2 items-center">
			<Toggle.Root size="sm">
				<Toggle.Icon><Bold size={14} /></Toggle.Icon>
			</Toggle.Root>
			<Toggle.Root size="md" pressed>
				<Toggle.Icon><Italic size={14} /></Toggle.Icon>
			</Toggle.Root>
		</div>
	),
};
