import clsx from "clsx";

interface IRootProps extends React.HTMLAttributes<HTMLDivElement> {

	children?: React.ReactNode;

}

export const FloatWindowRoot: React.FC<IRootProps> = ({ children, ...props }) => (
	<aside {...props} className={clsx("w-lg h-80 bg-chrome rounded-lg border border-line flex flex-col overflow-hidden", props.className)}>
		{children}
	</aside>
);
