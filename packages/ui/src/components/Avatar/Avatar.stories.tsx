import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar } from "./index";

const meta: Meta = {
	title: "Components/Avatar",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const WithFallback: StoryObj = {
	render: () => (
		<div className="flex gap-4 items-center">
			<Avatar.Root size="sm">
				<Avatar.Fallback>HV</Avatar.Fallback>
			</Avatar.Root>
			<Avatar.Root size="md">
				<Avatar.Fallback>HV</Avatar.Fallback>
			</Avatar.Root>
			<Avatar.Root size="lg">
				<Avatar.Fallback>HV</Avatar.Fallback>
			</Avatar.Root>
		</div>
	),
};

export const Shapes: StoryObj = {
	render: () => (
		<div className="flex gap-4 items-center">
			<Avatar.Root size="md" shape="circle">
				<Avatar.Fallback>HV</Avatar.Fallback>
			</Avatar.Root>
			<Avatar.Root size="md" shape="square">
				<Avatar.Fallback>HV</Avatar.Fallback>
			</Avatar.Root>
		</div>
	),
};

export const Stack: StoryObj = {
	render: () => (
		<Avatar.Stack>
			<Avatar.Root size="md"><Avatar.Fallback>A</Avatar.Fallback></Avatar.Root>
			<Avatar.Root size="md"><Avatar.Fallback>B</Avatar.Fallback></Avatar.Root>
			<Avatar.Root size="md"><Avatar.Fallback>C</Avatar.Fallback></Avatar.Root>
		</Avatar.Stack>
	),
};
