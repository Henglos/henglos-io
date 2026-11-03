import { Button, Text } from "@henglosio/ui";
import clsx from "clsx";
import { FolderTree } from "lucide-react";

interface IFilesButtonProps {
	active?: boolean;
	onClick?: () => void;
}

export const FilesButton: React.FC<IFilesButtonProps> = ({ active, onClick }) => {

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
				<FolderTree size={13} />
			</Button.Icon>
			<Button.Label>
				<Text variant="low">files</Text>
			</Button.Label>
		</Button.Root>
	);

};
