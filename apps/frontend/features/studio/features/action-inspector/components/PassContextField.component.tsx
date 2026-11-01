import { Switch, Text } from "@henglosio/ui";

type PassContextFieldProps = {
	checked: boolean;
	onChange: (checked: boolean) => void;
};

/**
 * Advanced › Pass Context — every action has it (Start and the triggers
 * aside): off, the next action gets only what this one published; on, also
 * everything this one was handed — so an output reaches further down the flow.
 */
export const PassContextField: React.FC<PassContextFieldProps> = ({ checked, onChange }) => (
	<div className="flex items-start justify-between gap-3 nodrag">
		<div className="flex flex-col gap-0.5 min-w-0">
			<Text variant="dim" size="xs">Pass Context</Text>
			<Text variant="low" size="xs">
				{checked
					? "The next action also gets the data this one was handed."
					: "The next action gets only this one's outputs."}
			</Text>
		</div>
		<Switch.Root checked={checked} onCheckedChange={onChange} />
	</div>
);
