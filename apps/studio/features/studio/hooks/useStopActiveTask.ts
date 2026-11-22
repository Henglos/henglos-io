import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { stopTask } from "@shared/api";
import { ActiveTaskAtom, ActiveTaskIdAtom, isTerminalStatus } from "../store/logs.store";
import { DriverConnectionAtom } from "../store/driver.store";

/**
 * Stopping the active task — a compile (preparing the environment, building),
 * a flash, a session — from wherever it's shown: the Logs panel, the activity
 * card. The driver aborts it (the build container is stopped); `stopping`
 * holds from the click until another task is followed, or the request fails.
 */
export function useStopActiveTask() {

	const taskId = useAtomValue(ActiveTaskIdAtom);
	const active = useAtomValue(ActiveTaskAtom);
	const driver = useAtomValue(DriverConnectionAtom);

	const [stopping, setStopping] = useState(false);

	useEffect(() => { setStopping(false); }, [taskId]);

	const running = active ? !isTerminalStatus(active.status) : false;

	const stop = useCallback(async () => {
		if (!driver || !taskId || !active) return;
		setStopping(true);
		try {
			await stopTask(driver.id, active.type, taskId);
		} catch {
			setStopping(false);
		}
	}, [driver, taskId, active]);

	return { running, stopping, stop, canStop: running && !!driver };

}
