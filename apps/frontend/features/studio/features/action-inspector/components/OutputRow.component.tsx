import { Text, Tooltip } from "@henglosio/ui";
import { shapeLabel } from "@henglosio/workflow";
import type { IKSchema } from "@henglosio/workflow";
import { GripVertical, Info } from "lucide-react";
import clsx from "clsx";
import { useBindDraggable } from "@/features/studio/lib/bindDrag";
import { hasShapeFields, ShapeTree, shortShapeLabel } from "@/features/studio/components/ActionNode/components/ShapeTree.component";

type OutputRowProps = {
	actionId: string;
	output: IKSchema;
};

/**
 * One output of an action: its name and type, dragged onto a config (or into
 * the code editor) to bind it — and, for a list or an object, its fields
 * under it, each draggable on its own.
 */
export const OutputRow: React.FC<OutputRowProps> = ({ actionId, output }) => {

	const { bind, isDragging } = useBindDraggable(`output:${actionId}:${output.name}`, { kind: "output", actionId, outputName: output.name });

	return (
		<div className="flex flex-col">
			<div
				{...bind}
				className={clsx("flex items-center justify-between gap-2 px-1 py-1.5 rounded-sm cursor-grab active:cursor-grabbing outline-none hover:bg-hover", isDragging && "opacity-50")}
			>
				<div className="flex items-center gap-2 min-w-0">
					<GripVertical size={12} className="text-fg-muted shrink-0" />
					{output.description && (
						<Tooltip.Provider>
							<Tooltip.Root>
								<Tooltip.Trigger className="text-fg-secondary">
									<Info size={12} />
								</Tooltip.Trigger>
								<Tooltip.Content>
									<Text variant="high" size="xs">{output.description}</Text>
								</Tooltip.Content>
							</Tooltip.Root>
						</Tooltip.Provider>
					)}
					<Text variant="high" size="xs" font="mono" className="break-all">{output.name}</Text>
				</div>
				<Text variant="low" size="xs" font="mono" className="shrink-0" title={shapeLabel(output.type)}>{shortShapeLabel(output.type)}</Text>
			</div>
			{hasShapeFields(output.type) && <ShapeTree shape={output.type} actionId={actionId} outputName={output.name} />}
		</div>
	);

};
