import { Text } from "@henglosio/ui";
import { Gauge } from "lucide-react";
import { useBaudrate } from "./hooks/useBaurate.hook";

export const BaudrateConnection = () => {

	const { baudrates, selectedBaudrate } = useBaudrate();

	if (baudrates.length === 0) return null;

	return (

		<div className="flex items-center gap-2 px-2 h-8">
			<Gauge size={12} className="text-fg-muted" />
			<Text variant="dim" size="xs" font="mono" className="max-w-28 truncate">
				{selectedBaudrate} baud
			</Text>
		</div>

	);

};
