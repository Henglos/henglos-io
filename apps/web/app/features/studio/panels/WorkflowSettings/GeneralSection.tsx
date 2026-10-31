import React from "react";
import type { WorkflowDetail } from "@shared/types/workflow.types";
import { Field, ReadValue, SectionTitle } from "./shared";

export const GeneralSection: React.FC<{ workflow: WorkflowDetail }> = ({ workflow }) => (
	<div className="flex flex-col gap-6">
		<SectionTitle>General</SectionTitle>
		<Field label="Name">
			<ReadValue value={workflow.name} />
		</Field>
		<Field label="Description">
			<ReadValue value={workflow.description || "—"} />
		</Field>
		<Field label="Platform">
			<ReadValue value={workflow.platform} mono />
		</Field>
		<Field label="Workflow ID">
			<ReadValue value={workflow.id} mono />
		</Field>
	</div>
);
