import { cn } from "@henglosio/ui";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
	side: "left" | "right";
	children?: React.ReactElement | React.ReactElement[];
}

export const Sidebar: React.FC<SidebarProps> = ({ side, children, className, ...props }) => {

	return (
		<section
			className={cn(
				"w-56 h-full bg-chrome divide-y divide-line border-line flex flex-col overflow-hidden",
				side == "left" ? "border-l" : "border-r",
				className,
			)}
			{...props}
		>
			{ children }
		</section>
	);


}
