import type { Meta, StoryObj } from "@storybook/react-vite";
import { Search } from "lucide-react";
import { Input } from "./index";
import { Select } from "../Select";

const meta: Meta = {
	title: "Components/Input",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const Basic: StoryObj = {
	render: () => (
		<div className="w-72">
			<Input.Root>
				<Input.Field placeholder="Type something…" />
			</Input.Root>
		</div>
	),
};

export const WithLabel: StoryObj = {
	render: () => (
		<div className="w-72 flex flex-col gap-4">
			<Input.Root>
				<Input.Label>Name</Input.Label>
				<Input.Field placeholder="John Doe" />
			</Input.Root>
			<Input.Root>
				<Input.Label>Email</Input.Label>
				<Input.Field placeholder="john@example.com" />
			</Input.Root>
		</div>
	),
};

export const WithPrefix: StoryObj = {
	render: () => (
		<div className="w-72">
			<Input.Root>
				<Input.Prefix>
					<Search size={14} />
				</Input.Prefix>
				<Input.Field placeholder="Search…" />
			</Input.Root>
		</div>
	),
};

export const WithSelect: StoryObj = {
	render: () => (
		<div className="w-72">
			<Input.Root>
				<Input.Field placeholder="Amount…" />
				<Input.Select defaultValue="px" placeholder="unit">
					<Select.Item value="px">px</Select.Item>
					<Select.Item value="%">%</Select.Item>
					<Select.Item value="rem">rem</Select.Item>
				</Input.Select>
			</Input.Root>
		</div>
	),
};

export const Disabled: StoryObj = {
	render: () => (
		<div className="w-72">
			<Input.Root disable>
				<Input.Field placeholder="Disabled" defaultValue="Cannot edit" />
			</Input.Root>
		</div>
	),
};
