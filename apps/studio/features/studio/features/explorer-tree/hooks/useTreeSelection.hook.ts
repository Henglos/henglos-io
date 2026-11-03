import { useAtom } from "jotai";
import { WorkspaceSelectionAtom } from "@/features/studio/store/canvas.store";

export const useTreeSelection = () => {

	const [selection, setSelection] = useAtom(WorkspaceSelectionAtom);

	const isActionSelected = (actionId: string) =>
		selection.some(selc => selc.actionId.some(act => act === actionId));

	const selectAction = (componentId: string, actionId: string, additive: boolean) => {

		if (additive) {

			const existing = selection.find(s => s.componentId === componentId);
			setSelection([
				...selection.filter(s => s.componentId !== componentId),
				{ componentId, actionId: [...(existing?.actionId ?? []), actionId] },
			]);

		} else {

			setSelection([{ componentId, actionId: [actionId] }]);

		}

	};

	return { selection, isActionSelected, selectAction };

}
