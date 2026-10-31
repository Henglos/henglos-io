import type { Meta, StoryObj } from "@storybook/react-vite";
import { MoreHorizontal, Copy, Trash2, Edit } from "lucide-react";
import { Button } from "../Button";
import { Dropdown } from "./index";

const meta: Meta = {
	title: "Components/Dropdown",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const Default: StoryObj = {
	render: () => (
		<Dropdown.Root>
			<Dropdown.Trigger asChild>
				<Button.Root variant="ghost">
					<Button.Icon><MoreHorizontal size={14} /></Button.Icon>
				</Button.Root>
			</Dropdown.Trigger>
			<Dropdown.Content>
				<Dropdown.Item>
					<Edit size={12} />
					<Dropdown.Label>Edit</Dropdown.Label>
				</Dropdown.Item>
				<Dropdown.Item>
					<Copy size={12} />
					<Dropdown.Label>Duplicate</Dropdown.Label>
				</Dropdown.Item>
				<Dropdown.Item>
					<Trash2 size={12} />
					<Dropdown.Label>Delete</Dropdown.Label>
				</Dropdown.Item>
			</Dropdown.Content>
		</Dropdown.Root>
	),
};
