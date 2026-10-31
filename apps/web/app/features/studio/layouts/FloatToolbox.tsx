import { useSetAtom } from "jotai";
import { Button } from "@henglosio/ui";
import { Plus, StickyNote } from "lucide-react";
import { PendingCanvasAddActionAtom } from "../store/canvas.store";

export const FloatToolboxLayout = () => {

	const setPendingAddAction = useSetAtom(PendingCanvasAddActionAtom);

	// The picker of the workflow's actions (see CanvasAddActionStore) — components
	// are added from the Components list.
	const openAddAction = (e: React.MouseEvent) => {
		setPendingAddAction({ screenPosition: { x: e.clientX, y: e.clientY } });
	};

	return (

		<div className="flex gap-2 absolute left-0 bottom-0 rounded-sm m-4">

			<Button.Root variant="surface" size="md" onClick={openAddAction} title="Add action">
				<Button.Icon>
					<Plus size={16}/>
				</Button.Icon>
			</Button.Root>

		</div>

	);

}
