import { Button, Input, Select, Text } from "@henglosio/ui";
import { isListShape, isObjectShape, type IShape } from "@henglosio/workflow";
import { Plus, Trash2 } from "lucide-react";

// The scalars a variable's list items / object fields can be — the same four
// simple variable types.
const SCALARS: { value: IShape; label: string }[] = [
	{ value: "integer", label: "Integer" },
	{ value: "float", label: "Float" },
	{ value: "bool", label: "Bool" },
	{ value: "string", label: "String" },
];

// Its row in SCALARS.
const scalarIndex = (shape: IShape) => SCALARS.findIndex(scalar => scalar.value === shape);

const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

type Fields = { [field: string]: IShape };

/** Why `fields` can't be an object's, or null. */
export const fieldsError = (fields: Fields): string | null => {
	const names = Object.keys(fields);
	if (names.length === 0) return "Give it at least one field.";
	const bad = names.find(name => !FIELD_NAME.test(name));
	return bad !== undefined ? `"${bad}" — a field name is letters, digits and _ (not starting with a digit).` : null;
};

/** An object's fields: one row each — its name and what it holds. */
const FieldsEditor: React.FC<{ fields: Fields; onChange: (fields: Fields) => void }> = ({ fields, onChange }) => {

	const entries = Object.entries(fields);
	const rename = (index: number, name: string) =>
		onChange(Object.fromEntries(entries.map(([field, shape], i) => [i === index ? name : field, shape])));
	const retype = (index: number, shape: IShape) =>
		onChange(Object.fromEntries(entries.map(([field, old], i) => [field, i === index ? shape : old])));

	return (
		<div className="flex flex-col gap-1">
			{entries.map(([field, shape], index) => (
				<div key={index} className="flex items-center gap-1">
					<Input.Root className="h-7 flex-1" value={field}>
						<Input.Field value={field} placeholder="field" className="font-mono" onChange={event => rename(index, event.target.value)} />
					</Input.Root>
					<Select.Root value={String(scalarIndex(shape))} onValueChange={next => retype(index, SCALARS[Number(next)]!.value)} className="w-28">
						<Select.Trigger />
						<Select.Content>
							{SCALARS.map((scalar, i) => <Select.Item key={scalar.label} value={String(i)}>{scalar.label}</Select.Item>)}
						</Select.Content>
					</Select.Root>
					<Button.Root type="button" variant="ghost" size="sm" onClick={() => onChange(Object.fromEntries(entries.filter((_, i) => i !== index)))} title="Remove the field">
						<Button.Icon><Trash2 size={11} className="text-danger" /></Button.Icon>
					</Button.Root>
				</div>
			))}
			<Button.Root type="button" variant="ghost" size="sm" className="self-start"
				onClick={() => {
					let name = "field";
					for (let i = 2; name in fields; i++) name = `field${i}`;
					onChange({ ...fields, [name]: "float" });
				}}>
				<Button.Icon><Plus size={11} /></Button.Icon>
				<Button.Label>Add a field</Button.Label>
			</Button.Root>
		</div>
	);

};

type ShapeBuilderProps = {
	/** A list variable's ({ list: … }) or an object variable's ({ object: … }). */
	shape: IShape;
	onChange: (shape: IShape) => void;
};

/**
 * What a list or an object variable holds: a list's item — a scalar, or an
 * object of scalar fields — or an object's fields. (Deeper shapes come from
 * outputs and manifests; a variable keeps to these.)
 */
export const ShapeBuilder: React.FC<ShapeBuilderProps> = ({ shape, onChange }) => {

	if (isObjectShape(shape)) {
		return <FieldsEditor fields={shape.object} onChange={fields => onChange({ object: fields })} />;
	}

	if (!isListShape(shape)) return null;
	const item = shape.list;
	const itemKind = isObjectShape(item) ? "object" : String(scalarIndex(item));

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<Text variant="dim" size="xs" className="shrink-0">Each item is</Text>
				<Select.Root
					value={itemKind}
					onValueChange={next => onChange({ list: next === "object" ? { object: { x: "float" } } : SCALARS[Number(next)]!.value })}
					className="flex-1"
				>
					<Select.Trigger />
					<Select.Content>
						{SCALARS.map((scalar, i) => <Select.Item key={scalar.label} value={String(i)}>{scalar.label}</Select.Item>)}
						<Select.Item value="object">Object (fields)</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
			{isObjectShape(item) && <FieldsEditor fields={item.object} onChange={fields => onChange({ list: { object: fields } })} />}
		</div>
	);

};
