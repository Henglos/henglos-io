import zod from "zod";

/** GET /platforms — the platform versions available. */
export const ListPlatformsOutSchema = zod.object({
	platforms: zod.array(zod.string()),
});

/** GET /platforms — the platform versions available. */
export type ListPlatformsOut = zod.infer<typeof ListPlatformsOutSchema>;
