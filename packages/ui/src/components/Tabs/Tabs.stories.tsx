import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs } from "./index";

const meta: Meta = {
	title: "Components/Tabs",
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

export const Default: StoryObj = {
	render: () => (
		<Tabs.Root defaultValue="overview" className="w-80">
			<Tabs.List>
				<Tabs.Tab value="overview">Overview</Tabs.Tab>
				<Tabs.Tab value="settings">Settings</Tabs.Tab>
				<Tabs.Tab value="logs">Logs</Tabs.Tab>
			</Tabs.List>
			<Tabs.Panel value="overview">
				<div className="p-4 text-sm" style={{ color: "var(--fg-muted)" }}>Overview content</div>
			</Tabs.Panel>
			<Tabs.Panel value="settings">
				<div className="p-4 text-sm" style={{ color: "var(--fg-muted)" }}>Settings content</div>
			</Tabs.Panel>
			<Tabs.Panel value="logs">
				<div className="p-4 text-sm" style={{ color: "var(--fg-muted)" }}>Logs content</div>
			</Tabs.Panel>
		</Tabs.Root>
	),
};
