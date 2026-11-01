import { Redo2, Undo2 } from "lucide-react";
import { Button, Text, Tooltip } from "@henglosio/ui";
import { useWorkflowHistory } from "../../hooks/useWorkflowHistory";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";

export const HistoryControls = () => {

	const { undo, redo, canUndo, canRedo } = useWorkflowHistory();

	return (

		<Tooltip.Provider delayDuration={400}>
			<div className="flex items-center gap-1">

				<Tooltip.Root>
					<Tooltip.Trigger asChild>
						<Button.Root variant="ghost" size="sm" disabled={!canUndo} onClick={undo} aria-label="Undo">
							<Button.Icon><Undo2 size={14} /></Button.Icon>
						</Button.Root>
					</Tooltip.Trigger>
					<Tooltip.Content side="bottom">
						<Text variant="high" size="xs">Undo · {mod}+Z</Text>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger asChild>
						<Button.Root variant="ghost" size="sm" disabled={!canRedo} onClick={redo} aria-label="Redo">
							<Button.Icon><Redo2 size={14} /></Button.Icon>
						</Button.Root>
					</Tooltip.Trigger>
					<Tooltip.Content side="bottom">
						<Text variant="high" size="xs">Redo · {mod}+Shift+Z</Text>
					</Tooltip.Content>
				</Tooltip.Root>

			</div>
		</Tooltip.Provider>

	);

}
