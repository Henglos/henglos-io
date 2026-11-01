import { useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { Button, DotStatus, Text } from "@henglosio/ui";
import { Settings } from "lucide-react";
import { WorkflowAtom, WorkflowStatusAtom } from "@/features/studio/store/workflow.store";
import { PlatformWindow } from "./PlatformWindow.component";

export const WorkflowHeader = () => {

	const [workflow, setWorkflow] = useAtom(WorkflowAtom);
	const workflowStatus = useAtomValue(WorkflowStatusAtom);
	const [platformOpen, setPlatformOpen] = useState(false);

	const updateWorkflowNameHandle = (name: string) => {

		if (!workflow || name.trim() == "") return;
		setWorkflow({ ...workflow, name: name.trim() });

	}

	return (

		<div className="flex flex-col h-fit py-4">

			<div className="flex gap-2 items-center px-4">
				<Text onChange={updateWorkflowNameHandle} variant="high" size="sm" font="mono" editable dbClick className="mr-auto">{workflow?.name}</Text>
				{/* Platform version and limits — what gets compiled onto the board. */}
				<Button.Root variant="ghost" className="p-2!" onClick={() => setPlatformOpen(true)} disabled={!workflow} title="Workflow settings — board and platform">
					<Button.Icon>
						<Settings size={12} />
					</Button.Icon>
				</Button.Root>
				<DotStatus status={workflowStatus?.saved ? "success" : "disable"} />
			</div>

			{platformOpen && <PlatformWindow onClose={() => setPlatformOpen(false)} />}

		</div>

	);

}
