import type { Meta, StoryObj } from "@storybook/react-vite";
import { Textarea } from "./index";

const meta: Meta = {
	title: "Components/Textarea",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const Basic: StoryObj = {
	render: () => (
		<div className="w-72">
			<Textarea.Root>
				<Textarea.Field placeholder="Enter a description…" rows={4} />
			</Textarea.Root>
		</div>
	),
};

export const WithLabel: StoryObj = {
	render: () => (
		<div className="w-72">
			<Textarea.Root>
				<Textarea.Label>Description</Textarea.Label>
				<Textarea.Field placeholder="Enter a description…" rows={4} />
			</Textarea.Root>
		</div>
	),
};
