import { Button, Text } from "@henglosio/ui";
import clsx from "clsx";
import { PanelsTopLeft } from "lucide-react";

interface IInspectorButtonProps {
	active?: boolean;
	onClick?: () => void;
}

export const InspectorButton: React.FC<IInspectorButtonProps> = ({ active, onClick }) => {

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
				<PanelsTopLeft size={13} />
			</Button.Icon>
			<Button.Label>
				<Text variant="low">inspector</Text>
			</Button.Label>
		</Button.Root>
	);

};
