import { Button, Text } from "@henglosio/ui";
import clsx from "clsx";
import { SquareTerminal } from "lucide-react";

interface IReplButtonProps {
	active?: boolean;
	onClick?: () => void;
}

export const ReplButton: React.FC<IReplButtonProps> = ({ active, onClick }) => {

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
				<SquareTerminal size={13} />
			</Button.Icon>
			<Button.Label>
				<Text variant="low">repl</Text>
			</Button.Label>
		</Button.Root>
	);

};
