import zod from "zod";

/** Where HenglosIO's releases are published: tags vX.Y.Z on GitHub. */
export const HENGLOSIO_REPOSITORY = "https://github.com/Henglos/henglos-io";

/**
 * GET /system/update — whether a newer HenglosIO than the one running was
 * released. `current` is null when the hosting doesn't know its version (not
 * a release image: a dev run, an edge build); `latest` is null when the check
 * is off (HIO_UPDATE_CHECK=false) or GitHub didn't answer.
 */
export const UpdateStatusOutSchema = zod.object({
	current: zod.string().nullable(),
	latest: zod.string().nullable(),
	/** `latest` is newer than `current`. */
	available: zod.boolean(),
	/** The release's page on GitHub, when there's one to show. */
	url: zod.string().nullable(),
});

/** GET /system/update — whether a newer HenglosIO was released. */
export type UpdateStatusOut = zod.infer<typeof UpdateStatusOutSchema>;
