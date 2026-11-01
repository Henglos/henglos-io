import React from "react";
import type { WorkflowDetail } from "@shared/types/workflow.types";
import { Field, ReadValue, SectionTitle } from "./shared";

export const BuildSection: React.FC<{ workflow: WorkflowDetail }> = ({ workflow }) => {
	const board = workflow.data.board;
	return (
		<div className="flex flex-col gap-6">
			<SectionTitle>Board</SectionTitle>
			<Field label="Name">
				<ReadValue value={board.base.name} />
			</Field>
			<Field label="Description">
				<ReadValue value={board.base.description || "—"} />
			</Field>
			<Field label="Package ID">
				<ReadValue value={board.packageId} mono />
			</Field>

			<div className="border-t border-line pt-6 flex flex-col gap-6">
				<SectionTitle>Workspace</SectionTitle>
				<div className="grid grid-cols-2 gap-4">
					<Field label="Components">
						<ReadValue value={String(workflow.data.components.length)} />
					</Field>
					<Field label="Connections">
						<ReadValue value={String(workflow.data.connections.length)} />
					</Field>
				</div>
			</div>
		</div>
	);
};
