import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "./Skeleton";

const meta: Meta = {
	title: "Components/Skeleton",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const Default: StoryObj = {
	render: () => (
		<div className="flex flex-col gap-2 w-64">
			<Skeleton className="h-4 w-3/4 rounded" />
			<Skeleton className="h-4 w-full rounded" />
			<Skeleton className="h-4 w-1/2 rounded" />
			<Skeleton className="h-8 w-full rounded mt-2" />
		</div>
	),
};
