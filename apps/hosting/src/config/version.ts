import semver from "semver";

/**
 * The HenglosIO release this hosting is — HIO_VERSION, which the release
 * image sets from its tag (v1.2.3 → 1.2.3). Null when it's unset (a dev run)
 * or not a version (an edge build passes its branch, "main"). The package.json
 * version isn't it: the hosting is released by the repo's tag, not by bumping it.
 */
export const releaseVersion = (raw: string | undefined): string | null =>
	raw ? semver.valid(semver.clean(raw) ?? "") : null;
