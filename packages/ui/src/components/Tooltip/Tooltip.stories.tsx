import type { Meta, StoryObj } from "@storybook/react-vite";
import { Info } from "lucide-react";
import { Button } from "../Button";
import { Tooltip } from "./index";

const meta: Meta = {
	title: "Components/Tooltip",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const Default: StoryObj = {
	render: () => (
		<Tooltip.Provider>
			<Tooltip.Root>
				<Tooltip.Trigger asChild>
					<Button.Root variant="surface">
						<Button.Label>Hover me</Button.Label>
					</Button.Root>
				</Tooltip.Trigger>
				<Tooltip.Content>Add to workspace</Tooltip.Content>
			</Tooltip.Root>
		</Tooltip.Provider>
	),
};

export const IconTrigger: StoryObj = {
	render: () => (
		<Tooltip.Provider>
			<Tooltip.Root>
				<Tooltip.Trigger asChild>
					<Button.Root variant="ghost">
						<Button.Icon><Info size={14} /></Button.Icon>
					</Button.Root>
				</Tooltip.Trigger>
				<Tooltip.Content>More information about this field</Tooltip.Content>
			</Tooltip.Root>
		</Tooltip.Provider>
	),
};

export const Sides: StoryObj = {
	render: () => (
		<Tooltip.Provider>
			<div className="flex gap-8">
				{(["top", "right", "bottom", "left"] as const).map((side) => (
					<Tooltip.Root key={side}>
						<Tooltip.Trigger asChild>
							<Button.Root variant="surface">
								<Button.Label className="capitalize">{side}</Button.Label>
							</Button.Root>
						</Tooltip.Trigger>
						<Tooltip.Content side={side}>Tooltip on {side}</Tooltip.Content>
					</Tooltip.Root>
				))}
			</div>
		</Tooltip.Provider>
	),
};

export const WithoutArrow: StoryObj = {
	render: () => (
		<Tooltip.Provider>
			<Tooltip.Root>
				<Tooltip.Trigger asChild>
					<Button.Root variant="surface">
						<Button.Label>No arrow</Button.Label>
					</Button.Root>
				</Tooltip.Trigger>
				<Tooltip.Content hideArrow>Clean tooltip, no arrow</Tooltip.Content>
			</Tooltip.Root>
		</Tooltip.Provider>
	),
};

export const Disabled: StoryObj = {
	render: () => (
		<Tooltip.Provider>
			<Tooltip.Root>
				<Tooltip.Trigger asChild>
					<Button.Root variant="surface" disabled>
						<Button.Label>Disabled action</Button.Label>
					</Button.Root>
				</Tooltip.Trigger>
				<Tooltip.Content>This action is unavailable right now</Tooltip.Content>
			</Tooltip.Root>
		</Tooltip.Provider>
	),
};
