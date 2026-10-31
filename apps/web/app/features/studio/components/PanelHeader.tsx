
import { Button, Skeleton } from "@henglosio/ui";
import { Settings } from "lucide-react";

interface PanelHeaderProps {
	name?: string;
	loading: boolean;
}

export const PanelHeader = ({ name, loading }: PanelHeaderProps) => (
	<div className="flex flex-col gap-2 px-2 py-2 w-full">

		<a href="/workspace/me" className="w-fit flex items-center justify-center p-2">
			<img src="/logo.svg" className="w-6 h-auto" alt="logo" />
		</a>

		{loading ? (
			<Skeleton className="h-4 w-32 rounded" />
		) : (

			<div className="w-full flex items-center">

				<span className="text-fg text-sm truncate">
					{name ?? "Workflow"}
				</span>

				<Button.Root variant="ghost" className="ml-auto">
					<Button.Icon>
						<Settings size={16}/>
					</Button.Icon>
				</Button.Root>

			</div>
		)}
	</div>
);
