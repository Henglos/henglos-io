import { Button, DotStatus, Text, Tree } from "@henglosio/ui";
import clsx from "clsx";
import { Check, Computer, Unplug } from "lucide-react";


type DriverItemProps = {


	id: string;
	name: string;
	online: boolean;

	connected: boolean;

	onConnect: (driver: { id: string; name: string; online: boolean; }) => void;


}

export const DriverItem: React.FC<DriverItemProps> = ({ id, name, online, connected, onConnect }) => {

	return (

		<div className={clsx(
				"flex items-center gap-2 px-2 py-2 border-transparent hover:border-line-strong hover:bg-hover rounded-sm cursor-pointer",
				connected && "border-accent! hover:border-accent-hover!",
			)}
			onClick={() => onConnect({ id, name, online })}
		>

			<DotStatus status={online ? "success" : "disable"} />

			<Tree.Icon className="text-fg-muted ml-2">
				<Computer size={14} />
			</Tree.Icon>

			<Text variant="dim" size="sm">{name}</Text>


		</div>

	);

}
