import { Bug, Play, RefreshCw, Settings, Unplug } from "lucide-react";
import { Button } from "@henglosio/ui";

interface WorkspaceToolbarProps {
	flashBytes?: number;
	memoryBytes?: number;
}

export const WorkspaceToolbar = ({ flashBytes, memoryBytes }: WorkspaceToolbarProps) => (

	<aside className="w-full h-10 bg-chrome border-b border-line flex items-center justify-between px-2">

		<div className="flex items-center gap-2">
			<Button.Root variant="ghost">
				<Button.Icon><RefreshCw size={16} /></Button.Icon>
			</Button.Root>
			<Button.Root variant="ghost">
				<Button.Icon><Play size={16} /></Button.Icon>
			</Button.Root>
			<Button.Root variant="ghost">
				<Button.Icon><Bug size={16} /></Button.Icon>
			</Button.Root>
			<Button.Root variant="ghost">
				<Button.Icon><Unplug size={16} /></Button.Icon>
			</Button.Root>
			<Button.Root variant="ghost">
				<Button.Icon><Settings size={16} /></Button.Icon>
			</Button.Root>
		</div>

		<div className="flex items-center gap-8">
			{flashBytes != null && (
				<span className="text-fg text-sm tracking-widest uppercase">
					Flash: {flashBytes} bytes
				</span>
			)}
			{memoryBytes != null && (
				<span className="text-fg text-sm tracking-widest uppercase">
					Memory: {memoryBytes} bytes
				</span>
			)}
		</div>

	</aside>
);
