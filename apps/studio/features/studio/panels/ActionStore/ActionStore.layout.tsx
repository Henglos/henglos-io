import type { IComponentRuntime } from "@henglosio/workflow";
import { FloatWindow } from "../../components/FloatWindow";
import { ActionStoreList } from "../../features/action-store/components/ActionStoreList.component";

interface IActionStoreLayout {
	component: IComponentRuntime;
}

export const ActionStoreLayout: React.FC<IActionStoreLayout> = ({ component }) => {

	return (
		<FloatWindow.Root className="p-2 gap-2">
			<ActionStoreList component={component} />
		</FloatWindow.Root>
	);
};
