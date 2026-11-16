import { Button, Text } from "@henglosio/ui";
import clsx from "clsx";
import { Logs } from "lucide-react";

interface ILogsButtonProps {
	active?: boolean;
	onClick?: () => void;
}

export const LogsButton: React.FC<ILogsButtonProps> = ({ active, onClick }) => {

	return (
		<Button.Root
			variant="ghost"
			className={clsx(
				active && "bg-active!",
				"rounded-none! h-full"
			)}
			onClick={onClick}
		>
			<Button.Icon>
				<Logs size={13} />
			</Button.Icon>
			<Button.Label>
				<Text variant="low">logs</Text>
			</Button.Label>
		</Button.Root>
	);

};
