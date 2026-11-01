import { useQuery } from "@tanstack/react-query";
import semver from "semver";
import { listPlatforms } from "@shared/api";

/** The published platform versions, newest first, and whether `current` is behind the newest. */
export function usePlatformVersions(current: string | undefined) {

	const { data = [], isLoading } = useQuery({
		queryKey: ["platforms"],
		queryFn: listPlatforms,
		staleTime: 60_000,
	});

	const versions = data.filter(version => semver.valid(version)).sort(semver.rcompare);
	const latest = versions[0];
	const outdated = !!latest && !!current && !!semver.valid(current) && semver.gt(latest, current);

	return { versions, latest, outdated, isLoading };

}
