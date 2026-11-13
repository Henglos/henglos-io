import zod from "zod";

/** The platform's npm package: the board runtime (packages/hio-system), with the sdk inside. */
export const PLATFORM_PACKAGE = "@henglosio/hio-system";

/** GET /platforms — the platform versions available. */
export const ListPlatformsOutSchema = zod.object({
	platforms: zod.array(zod.string()),
});

/** GET /platforms — the platform versions available. */
export type ListPlatformsOut = zod.infer<typeof ListPlatformsOutSchema>;
