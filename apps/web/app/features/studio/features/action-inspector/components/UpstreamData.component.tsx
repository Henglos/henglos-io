import { Text } from "@henglosio/ui";
import { isLogicComponent } from "@henglosio/workflow";
import type { IActionRuntime, IComponentRuntime } from "@henglosio/workflow";
import { useActionResult } from "@/features/studio/hooks/useActionResult";
import { OutputValue } from "@/features/studio/components/ActionNode/components/OutputValue.component";
import { OutputRow } from "./OutputRow.component";

type UpstreamDataProps = {
	upstream: { component: IComponentRuntime; action: IActionRuntime }[];
	/** Show what each output held in its action's last run (▶ / debug step). */
	withValues?: boolean;
};

/**
 * The actions that run before the one inspected, a card each with its
 * outputs — dragged onto a config to bind it.
 */
export const UpstreamData: React.FC<UpstreamDataProps> = ({ upstream, withValues }) => {

	if (upstream.length === 0) {
		return <Text variant="low" size="xs">Nothing before this action.</Text>;
	}

	return (
		<>
			{upstream.map(({ component, action }) => (
				<UpstreamCard key={action.id} component={component} action={action} withValues={withValues} />
			))}
		</>
	);

};

const UpstreamCard: React.FC<{ component: IComponentRuntime; action: IActionRuntime; withValues?: boolean }> = ({ component, action, withValues }) => {

	// Its own last run — a card per action so each reads its own.
	const { shown } = useActionResult(action.id);
	const valueOf = (name: string) => withValues ? shown?.values.find(value => value.name === name) : undefined;

	return (
		<div className="flex flex-col gap-0.5">
			<div className="flex items-baseline gap-1.5 px-1" title={withValues && shown ? `Ran at ${shown.ranAt.toLocaleTimeString()}` : undefined}>
				<Text variant="dim" size="xs" font="mono">{action.alias}</Text>
				<Text variant="low" size="xs">{isLogicComponent(component) ? "Logic" : component.alias}</Text>
			</div>
			<div className="flex flex-col">
				{(action.base.outputSchema ?? []).map(output => (
					<div key={output.name} className="flex flex-col">
						<OutputRow actionId={action.id} output={output} />
						{valueOf(output.name) && <OutputValue value={valueOf(output.name)!} source={{ actionId: action.id, outputName: output.name }} />}
					</div>
				))}
			</div>
		</div>
	);

};
