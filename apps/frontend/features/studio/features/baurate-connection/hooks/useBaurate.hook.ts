import { useAtom, useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { BaurateAtom } from "@/features/studio/store/driver.store";
import { WorkflowAtom } from "@/features/studio/store/workflow.store";

export const useBaudrate = () => {
	const workflow = useAtomValue(WorkflowAtom);
	const [override, setOverride] = useAtom(BaurateAtom);

	const baudrates = useMemo<number[]>(
		() => workflow?.data.board.base.connection.serial?.baudrates ?? [],
		[workflow],
	);

	// The board's default is the first supported rate; an override only applies
	// while it's still one of the board's options.
	const boardDefault = baudrates[0] ?? null;
	const selectedBaudrate =
		override !== null && baudrates.includes(override) ? override : boardDefault;

	// Drop a stale override (board changed, rate no longer offered) so we fall
	// back to the board default instead of sending an unsupported baud.
	useEffect(() => {
		if (override !== null && baudrates.length > 0 && !baudrates.includes(override)) {
			setOverride(null);
		}
	}, [baudrates, override, setOverride]);

	const selectBaudrate = (baudrate: number | null) => setOverride(baudrate);

	return { baudrates, selectedBaudrate, selectBaudrate };
};
