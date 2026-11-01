import { Text } from "@henglosio/ui";
import { OutputValue } from "@/features/studio/components/ActionNode/components/OutputValue.component";
import type { Inspector } from "../useInspector";
import { OutputRow } from "./OutputRow.component";

/** What the inspected action hands on — each output with what its last run put in it. */
export const ActionOutputs: React.FC<{ inspector: Inspector }> = ({ inspector }) => {

	const { action, outputSchema, undeclared, shown } = inspector;
	const valueOf = (name: string) => shown?.values.find(value => value.name === name);

	if (outputSchema.length === 0 && undeclared.length === 0) {
		return <Text variant="low" size="xs">No outputs.</Text>;
	}

	return (
		<>
			{outputSchema.map(output => (
				<div key={output.name} className="flex flex-col">
					<OutputRow actionId={action.id} output={output} />
					{valueOf(output.name) && <OutputValue value={valueOf(output.name)!} onEdit={shown?.onEdit} busy={shown?.busy} source={{ actionId: action.id, outputName: output.name }} />}
				</div>
			))}
			{!shown && <Text variant="low" size="xs" className="px-1">Run ▶ to see the values.</Text>}
			{undeclared.map(value => (
				<OutputValue key={value.name} value={value} showName onEdit={shown?.onEdit} busy={shown?.busy} />
			))}
		</>
	);

};
