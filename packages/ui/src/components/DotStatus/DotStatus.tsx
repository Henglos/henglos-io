import clsx from "clsx";

const styleStatus = {

	success: "bg-success",
	warning: "bg-warning",
	error: "bg-danger",
	disable: "bg-fg-muted",
	info: "bg-info"

}

export type DotStatusProps = {
	status: keyof typeof styleStatus;
}

/** A colored dot with a label — a status at a glance. */
export const DotStatus: React.FC<DotStatusProps> = ({ status }) => {

	return (

		<div
			className={clsx("size-2 rounded-full", styleStatus[status])}
		/>

	);

}
