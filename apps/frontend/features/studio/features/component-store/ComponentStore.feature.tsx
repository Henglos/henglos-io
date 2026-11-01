import { useAtom, useSetAtom } from "jotai";
import { useEffect } from "react";
import { Button, Text } from "@henglosio/ui";
import { Blocks, X } from "lucide-react";
import type { IComponentRuntime } from "@henglosio/workflow";
import { ActionStoreTargetAtom, ComponentStoreOpenAtom } from "@/features/studio/store/canvas.store";
import { ComponentStoreList } from "./components/ComponentStoreList.component";

export const ComponentStore = () => {

	const [open, setOpen] = useAtom(ComponentStoreOpenAtom);
	const setActionStoreTarget = useSetAtom(ActionStoreTargetAtom);

	const close = () => setOpen(false);

	const onActionAdded = (component: IComponentRuntime) => {
		setOpen(false);
		setActionStoreTarget(component);
	};

	const onComponentAdded = () => {
		setOpen(false);
	};

	useEffect(() => {
		if (!open) return;

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") close();
		};

		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open]);

	if (!open) return null;

	return (

		<div className="flex flex-col h-full">

			<div className="p-4 h-10 flex items-center justify-between shrink-0">
				<div className="flex items-center gap-2">
					<Blocks size={13} className="text-fg-secondary" />
					<Text variant="dim" size="xs" font="mono">Components Store</Text>
				</div>
				<Button.Root variant="ghost" className="p-2!" onClick={close}>
					<Button.Icon>
						<X size={12} />
					</Button.Icon>
				</Button.Root>
			</div>

			<div className="flex flex-col flex-1 min-h-0">
				<ComponentStoreList onActionAdded={onActionAdded} onComponentAdded={onComponentAdded} />
			</div>

		</div>

	);

};
