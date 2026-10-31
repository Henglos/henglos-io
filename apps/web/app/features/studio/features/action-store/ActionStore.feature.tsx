import { useAtom } from "jotai";
import { useEffect } from "react";
import { Button, Text } from "@henglosio/ui";
import { Zap, X } from "lucide-react";
import { ActionStoreTargetAtom } from "@/features/studio/store/canvas.store";
import { ActionStoreList } from "./components/ActionStoreList.component";

export const ActionStore = () => {

	const [target, setTarget] = useAtom(ActionStoreTargetAtom);

	const close = () => setTarget(null);

	useEffect(() => {
		if (!target) return;

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") close();
		};

		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [target]);

	if (!target) return null;

	return (

		<div className="flex flex-col h-full">

			<div className="pl-4 pr-2 h-8 flex items-center justify-between shrink-0 border-b border-line">
				<div className="flex items-center gap-2 min-w-0">
					<Zap size={13} className="text-fg-muted shrink-0" />
					<Text variant="low" size="xs" font="mono" className="truncate">Add action · {target.alias}</Text>
				</div>
				<Button.Root variant="ghost" className="p-2! shrink-0" onClick={close}>
					<Button.Icon>
						<X size={12} />
					</Button.Icon>
				</Button.Root>
			</div>

			<div className="flex flex-col gap-2 p-2 overflow-y-auto">
				<ActionStoreList component={target} onAdded={close} />
			</div>

		</div>

	);

};
