import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getWorkflow } from "@shared/api";
import type { WorkflowDetail } from "@shared/api";

export const useWorkflowData = () => {
	const { id: workflowId } = useParams<{ id: string }>();
	const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!workflowId) return;
		setLoading(true);
		getWorkflow(workflowId)
			.then(setWorkflow)
			.finally(() => setLoading(false));
	}, [workflowId]);

	return { workflow, loading };
};
