import { Text } from "@henglosio/ui";
import { isListShape, isObjectShape, shapeLabel } from "@henglosio/workflow";
import type { IShape } from "@henglosio/workflow";
import { GripVertical } from "lucide-react";
import clsx from "clsx";
import { useBindDraggable } from "@/features/studio/lib/bindDrag";

// An output's type in its row, short — "object[]", "int[]", "object" — and,
// for a list or an object, its fields under the row, one per line, nested as
// deep as the shape goes: a list of objects reads like the table it is. Each
// field drags onto a config (a Code binding reading it — the first item of a
// list) or into the code editor.

type OutputType = Parameters<typeof shapeLabel>[0];
type Path = (string | number)[];

/** The short form of a type: a list is "<item>[]", an object just "object". */
export const shortShapeLabel = (shape: OutputType): string =>
	isListShape(shape) ? `${shortShapeLabel(shape.list)}[]`
	: isObjectShape(shape) ? "object"
	: shapeLabel(shape);

// The object a shape's fields come from — itself, or the items of its list(s) —
// and the path down to it (an index per list).
const fieldsOf = (shape: OutputType, path: Path = []): { fields: Record<string, IShape>; path: Path } | null =>
	isListShape(shape) ? fieldsOf(shape.list, [...path, 0])
	: isObjectShape(shape) ? { fields: shape.object, path }
	: null;

/** Whether the shape has fields to list under the row. */
export const hasShapeFields = (shape: OutputType): boolean => fieldsOf(shape) !== null;

/** The shape found down `path` — undefined when it doesn't lead anywhere. */
export const shapeAtPath = (shape: OutputType | undefined, path: Path): OutputType | undefined => {
	let current = shape;
	for (const step of path) {
		if (typeof step === "number" && isListShape(current)) current = current.list;
		else if (typeof step === "string" && isObjectShape(current)) current = current.object[step];
		else return undefined;
	}
	return current;
};

type ShapeTreeProps = {
	shape: OutputType;
	actionId: string;
	outputName: string;
	/** Where `shape` sits inside the output. */
	path?: Path;
	depth?: number;
};

/** The fields of a list's items, or of an object — nothing for any other type. */
export const ShapeTree: React.FC<ShapeTreeProps> = ({ shape, actionId, outputName, path = [], depth = 0 }) => {

	const found = fieldsOf(shape, path);
	if (!found) return null;

	return (
		<div className={depth === 0 ? "flex flex-col mx-2 mb-2 pl-2 border-l border-line-subtle" : "flex flex-col pl-3 border-l border-line-subtle"}>
			{Object.entries(found.fields).map(([name, inner]) => (
				<div key={name} className="flex flex-col">
					<FieldRow name={name} shape={inner} actionId={actionId} outputName={outputName} path={[...found.path, name]} />
					<ShapeTree shape={inner} actionId={actionId} outputName={outputName} path={[...found.path, name]} depth={depth + 1} />
				</div>
			))}
		</div>
	);

};

type FieldRowProps = { name: string; shape: IShape; actionId: string; outputName: string; path: Path };

const FieldRow: React.FC<FieldRowProps> = ({ name, shape, actionId, outputName, path }) => {
	const { bind, isDragging } = useBindDraggable(`field:${actionId}:${outputName}:${path.join(".")}`, { kind: "field", actionId, outputName, path });
	return (
		<div
			{...bind}
			title="Drag onto a config (a Code binding reading it) or into the code editor"
			className={clsx("group/field flex items-center justify-between gap-3 py-0.5 -ml-1 pl-1 rounded-sm nodrag cursor-grab outline-none hover:bg-hover", isDragging && "opacity-50")}
		>
			<div className="flex items-center gap-1 min-w-0">
				<GripVertical size={10} className="shrink-0 text-fg-muted opacity-0 group-hover/field:opacity-100" />
				<Text variant="dim" size="xs" font="mono" className="break-all">{name}</Text>
			</div>
			<Text variant="low" size="xs" font="mono" className="shrink-0 pr-1">{shortShapeLabel(shape)}</Text>
		</div>
	);
};
