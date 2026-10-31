import React, { useState } from "react";
import { Button, Dialog, Text } from "@henglosio/ui";
import { useAtomValue } from "jotai";
import { X } from "lucide-react";
import { WorkflowAtom } from "../../store/workflow.store";
import { GeneralSection } from "./GeneralSection";
import { BuildSection } from "./BuildSection";
import { ConnectionSection } from "./ConnectionSection";

type Section = "general" | "build" | "connection";

const NAV_ITEMS: { id: Section; label: string }[] = [
	{ id: "general",    label: "General"    },
	{ id: "build",      label: "Build"      },
	{ id: "connection", label: "Connection" },
];

type WorkflowSettingsPanelProps = {
	onClose: () => void;
};

export const WorkflowSettingsPanel: React.FC<WorkflowSettingsPanelProps> = ({ onClose }) => {
	const workflow = useAtomValue(WorkflowAtom);
	const [section, setSection] = useState<Section>("general");

	if (!workflow) return null;

	return (
		<Dialog.Content
			aria-describedby={undefined}
			className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex w-206 h-130 border border-line-strong rounded-lg overflow-hidden shadow-xl"
			onEscapeKeyDown={onClose}
			onInteractOutside={onClose}
		>
			<Dialog.Title className="sr-only">Workflow Settings</Dialog.Title>

			{/* Left nav */}
			<div className="w-46 shrink-0 bg-chrome border-r border-line flex flex-col pt-4">
				<p className="text-xs text-fg-secondary uppercase tracking-wider px-4 pb-4">
					Settings
				</p>
				<nav className="flex flex-col gap-0.5 px-2">
					{NAV_ITEMS.map(({ id, label }) => (
						<button
							key={id}
							type="button"
							onClick={() => setSection(id)}
							className={`
								relative text-left text-xs px-4 py-2 rounded cursor-pointer transition-colors
								${section === id
									? "text-fg bg-active"
									: "text-fg-secondary hover:text-fg-muted hover:bg-hover"
								}
							`}
						>
							{section === id && (
								<span className="absolute left-0 inset-y-2 w-0.5 rounded-full bg-accent" />
							)}
							{label}
						</button>
					))}
				</nav>
			</div>

			{/* Content */}
			<div className="flex flex-col flex-1 min-w-0 bg-panel">
				<div className="flex items-center justify-between px-6 py-2 border-b border-line shrink-0">
					<Text variant="high" size="lg">
						{NAV_ITEMS.find(n => n.id === section)?.label}
					</Text>
					
					<Dialog.Close asChild>
						<Button.Root size="md" variant="ghost" onClick={onClose}>
							<Button.Icon><X size={14} /></Button.Icon>
						</Button.Root>
					</Dialog.Close>
				</div>

				<div className="flex-1 overflow-y-auto px-6 py-6">
					{section === "general"    && <GeneralSection    workflow={workflow} />}
					{section === "build"      && <BuildSection      workflow={workflow} />}
					{section === "connection" && <ConnectionSection workflow={workflow} />}
				</div>
			</div>

		</Dialog.Content>
	);
};
