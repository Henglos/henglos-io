import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus, Trash2, Settings } from "lucide-react";
import { Button } from "./index";

const meta: Meta = {
	title: "Components/Button",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const AllVariants: StoryObj = {
	render: () => (
		<div className="flex flex-wrap gap-4 items-center">
			<Button.Root variant="surface"><Button.Label>Surface</Button.Label></Button.Root>
			<Button.Root variant="ghost"><Button.Label>Ghost</Button.Label></Button.Root>
			<Button.Root variant="primary"><Button.Label>Primary</Button.Label></Button.Root>
			<Button.Root variant="destructive"><Button.Label>Destructive</Button.Label></Button.Root>
		</div>
	),
};

export const Sizes: StoryObj = {
	render: () => (
		<div className="flex flex-col gap-4">
			<div className="flex gap-4 items-center">
				<Button.Root variant="primary" size="sm"><Button.Label>Small</Button.Label></Button.Root>
				<Button.Root variant="primary" size="md"><Button.Label>Medium</Button.Label></Button.Root>
				<Button.Root variant="primary" size="lg"><Button.Label>Large</Button.Label></Button.Root>
			</div>
			<div className="flex gap-4 items-center">
				<Button.Root variant="surface" size="sm"><Button.Label>Small</Button.Label></Button.Root>
				<Button.Root variant="surface" size="md"><Button.Label>Medium</Button.Label></Button.Root>
				<Button.Root variant="surface" size="lg"><Button.Label>Large</Button.Label></Button.Root>
			</div>
			<div className="flex gap-4 items-center">
				<Button.Root variant="ghost" size="sm"><Button.Label>Small</Button.Label></Button.Root>
				<Button.Root variant="ghost" size="md"><Button.Label>Medium</Button.Label></Button.Root>
				<Button.Root variant="ghost" size="lg"><Button.Label>Large</Button.Label></Button.Root>
			</div>
		</div>
	),
};

export const IconOnly: StoryObj = {
	render: () => (
		<div className="flex flex-col gap-4">
			<div className="flex gap-4 items-center">
				<Button.Root variant="surface" size="sm"><Button.Icon><Settings size={12} /></Button.Icon></Button.Root>
				<Button.Root variant="surface" size="md"><Button.Icon><Settings size={14} /></Button.Icon></Button.Root>
				<Button.Root variant="surface" size="lg"><Button.Icon><Settings size={16} /></Button.Icon></Button.Root>
			</div>
			<div className="flex gap-4 items-center">
				<Button.Root variant="primary" size="sm"><Button.Icon><Plus size={12} /></Button.Icon></Button.Root>
				<Button.Root variant="primary" size="md"><Button.Icon><Plus size={14} /></Button.Icon></Button.Root>
				<Button.Root variant="primary" size="lg"><Button.Icon><Plus size={16} /></Button.Icon></Button.Root>
			</div>
			<div className="flex gap-4 items-center">
				<Button.Root variant="ghost" size="sm"><Button.Icon><Plus size={12} /></Button.Icon></Button.Root>
				<Button.Root variant="ghost" size="md"><Button.Icon><Plus size={14} /></Button.Icon></Button.Root>
				<Button.Root variant="ghost" size="lg"><Button.Icon><Plus size={16} /></Button.Icon></Button.Root>
			</div>
		</div>
	),
};

export const WithIcon: StoryObj = {
	render: () => (
		<div className="flex flex-col gap-4">
			<div className="flex gap-4 items-center">
				<Button.Root variant="primary" size="sm">
					<Button.Icon><Plus size={12} /></Button.Icon>
					<Button.Label>Create</Button.Label>
				</Button.Root>
				<Button.Root variant="primary" size="md">
					<Button.Icon><Plus size={14} /></Button.Icon>
					<Button.Label>Create</Button.Label>
				</Button.Root>
				<Button.Root variant="primary" size="lg">
					<Button.Icon><Plus size={16} /></Button.Icon>
					<Button.Label>Create</Button.Label>
				</Button.Root>
			</div>
			<div className="flex gap-4 items-center">
				<Button.Root variant="destructive" size="sm">
					<Button.Icon><Trash2 size={12} /></Button.Icon>
					<Button.Label>Delete</Button.Label>
				</Button.Root>
				<Button.Root variant="destructive" size="md">
					<Button.Icon><Trash2 size={14} /></Button.Icon>
					<Button.Label>Delete</Button.Label>
				</Button.Root>
				<Button.Root variant="destructive" size="lg">
					<Button.Icon><Trash2 size={16} /></Button.Icon>
					<Button.Label>Delete</Button.Label>
				</Button.Root>
			</div>
		</div>
	),
};

export const Disabled: StoryObj = {
	render: () => (
		<div className="flex flex-wrap gap-4 items-center">
			<Button.Root variant="surface" disabled><Button.Label>Surface</Button.Label></Button.Root>
			<Button.Root variant="primary" disabled><Button.Label>Primary</Button.Label></Button.Root>
			<Button.Root variant="ghost" disabled>
				<Button.Icon><Plus size={14} /></Button.Icon>
			</Button.Root>
		</div>
	),
};
