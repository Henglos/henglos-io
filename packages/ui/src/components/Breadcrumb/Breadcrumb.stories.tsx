import type { Meta, StoryObj } from "@storybook/react-vite";
import { Breadcrumb } from "./index";

const meta: Meta = {
	title: "Components/Breadcrumb",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const Default: StoryObj = {
	render: () => (
		<Breadcrumb.Root>
			<Breadcrumb.Item>Home</Breadcrumb.Item>
			<Breadcrumb.Item>Projects</Breadcrumb.Item>
			<Breadcrumb.Item current>Studio</Breadcrumb.Item>
		</Breadcrumb.Root>
	),
};
