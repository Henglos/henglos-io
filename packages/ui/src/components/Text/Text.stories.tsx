import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Text } from "./index";

const meta: Meta<typeof Text> = {
	title: "Components/Text",
	component: Text,
	tags: ["autodocs"],
	parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof Text>;

export const Default: Story = {
	args: {
		children: "Hello, world!",
		variant: "high",
		size: "md",
		font: "sans",
	},
};

export const Sizes: Story = {
	render: () => (
		<div className="flex flex-col gap-2">
			<Text font="sans" size="sm" variant="high">Small — 10px</Text>
			<Text font="sans" size="md" variant="high">Medium — 11px</Text>
			<Text font="sans" size="lg" variant="high">Large — 12px</Text>
			<Text font="sans" size="xl" variant="high">Extra Large — 27px</Text>
		</div>
	),
};

export const Variants: Story = {
	render: () => (
		<div className="flex flex-col gap-2">
			<Text font="sans" size="md" variant="high">High</Text>
			<Text font="sans" size="md" variant="dim">Dim</Text>
			<Text font="sans" size="md" variant="low">Low</Text>
			<Text font="sans" size="md" variant="contrast">Faint</Text>
		</div>
	),
};

export const Fonts: Story = {
	render: () => (
		<div className="flex flex-col gap-2">
			<Text font="sans" size="md" variant="high">Sans — primary font</Text>
			<Text font="mono" size="md" variant="high">Mono — monospace font</Text>
		</div>
	),
};

export const AllCombinations: Story = {
	render: () => (
		<div className="flex flex-col gap-6">
			{(["sans", "mono"] as const).map(font => (
				<div key={font} className="flex flex-col gap-2">
					<Text font={font} size="sm" variant="low">{font}</Text>
					{(["sm", "md", "lg", "xl"] as const).map(size => (
						<div key={size} className="flex gap-6">
							{(["high", "dim", "low", "contrast"] as const).map(variant => (
								<Text key={variant} font={font} size={size} variant={variant}>
									{size} / {variant}
								</Text>
							))}
						</div>
					))}
				</div>
			))}
		</div>
	),
};

// ── Editable ───────────────────────────────────────────────────────────────

function EditableDemo({ initial = "My Workflow", placeholder, dbClick }: { initial?: string; placeholder?: string; dbClick?: boolean }) {
	const [value, setValue] = useState(initial);
	return (
		<div className="flex flex-col gap-4 items-start">
			<Text
				editable
				dbClick={dbClick}
				font="sans"
				size="md"
				variant="high"
				value={value}
				onChange={setValue}
				placeholder={placeholder}
			/>
			<p className="text-xs text-fg-muted">
				Current value: <span className="text-fg-secondary">{value || "—"}</span>
			</p>
		</div>
	);
}

export const Editable: Story = {
	render: () => <EditableDemo />,
};

export const EditableDbClick: Story = {
	render: () => <EditableDemo dbClick initial="Double click me" />,
};

export const EditableWithPlaceholder: Story = {
	render: () => <EditableDemo initial="" placeholder="Untitled…" />,
};

export const EditableDisabled: Story = {
	render: () => (
		<div className="flex flex-col gap-4 items-start">
			<Text
				editable
				disabled
				font="sans"
				size="md"
				variant="high"
				value="Read-only text"
				onChange={() => {}}
			/>
			<p className="text-xs text-fg-muted">Click does nothing when disabled</p>
		</div>
	),
};

export const EditableList: Story = {
	render: () => {
		const [items, setItems] = useState(["Alpha", "Beta", "Gamma"]);
		const update = (index: number, next: string) =>
			setItems(prev => prev.map((v, i) => (i === index ? next : v)));
		return (
			<div className="w-56 bg-raised border border-line rounded-sm p-2 flex flex-col gap-2">
				<Text font="sans" size="sm" variant="low" className="px-2 pb-2">Click any item to rename</Text>
				<div className="flex flex-col gap-2">
					{items.map((item, i) => (
						<div
							key={i}
							className="flex items-center gap-2 px-2 py-2 rounded-sm hover:bg-hover group"
						>
							<Text font="sans" size="sm" variant="low" className="w-4 select-none">{i + 1}.</Text>
							<Text
								editable
								font="sans"
								size="md"
								variant="high"
								value={item}
								onChange={next => update(i, next)}
							/>
						</div>
					))}
				</div>
			</div>
		);
	},
};
