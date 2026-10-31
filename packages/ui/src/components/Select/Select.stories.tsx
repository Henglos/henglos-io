import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Select } from "./index";

const meta: Meta = {
	title: "Components/Select",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const Default: StoryObj = {
	render: () => {
		const [value, setValue] = useState("react");
		return (
			<Select.Root value={value} onValueChange={setValue} className="w-48">
				<Select.Trigger />
				<Select.Content>
					<Select.Item value="react">React</Select.Item>
					<Select.Item value="vue">Vue</Select.Item>
					<Select.Item value="svelte">Svelte</Select.Item>
					<Select.Item value="solid">Solid</Select.Item>
				</Select.Content>
			</Select.Root>
		);
	},
};

export const WithLabel: StoryObj = {
	render: () => {
		const [value, setValue] = useState("");
		return (
			<Select.Root value={value} onValueChange={setValue} className="w-48">
				<Select.Label>Framework</Select.Label>
				<Select.Trigger />
				<Select.Content>
					<Select.Item value="react">React</Select.Item>
					<Select.Item value="vue">Vue</Select.Item>
					<Select.Item value="svelte">Svelte</Select.Item>
				</Select.Content>
			</Select.Root>
		);
	},
};
