import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { getPlatformSettings } from "@shared/api";
import { WorkflowAtom } from "../store/workflow.store";
import { PlatformSpecAtom } from "../store/platform.store";

/**
 * Keeps PlatformSpecAtom on what the open workflow's platform version declares
 * (its settings' defaults and rules), so BoardLimitsAtom has the real defaults.
 * Mounted once by the studio; refetches only when the version changes — a
 * published version never changes (same query PlatformWindow reads).
 */
export function usePlatformSpec() {

	const version = useAtomValue(WorkflowAtom)?.platform;
	const setSpec = useSetAtom(PlatformSpecAtom);

	const { data } = useQuery({
		queryKey: ["platform-settings", version],
		queryFn: () => getPlatformSettings(version!),
		enabled: !!version,
		staleTime: Infinity,
	});

	useEffect(() => {
		setSpec(version && data ? { version, ...data } : null);
	}, [version, data, setSpec]);

}
