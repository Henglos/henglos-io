import { Text } from "@henglosio/ui";
import clsx from "clsx";

export const WorkflowStats: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => {

	return (

		<div className={clsx("flex gap-6 px-4", className)} {...props}>

			<div className="flex gap-2 items-center">

				<Text variant="low" size="xs" font="mono">FLASH</Text>
				<Text variant="dim" size="xs" font="mono">100</Text>
				<Text variant="dim" size="xs" font="mono">/100KB</Text>

			</div>

			<div className="flex gap-2 items-center">

				<Text variant="low" size="xs" font="mono">RAM</Text>
				<Text variant="dim" size="xs" font="mono">100</Text>
				<Text variant="dim" size="xs" font="mono">/100KB</Text>

			</div>

		</div>

	);

}
