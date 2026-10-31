import { http } from "@shared/lib/http";
import type { PlatformRule, PlatformSetting } from "@henglosio/shared";

export const listPlatforms = async (): Promise<string[]> => {
	const { data } = await http.get<{ platforms: string[] }>("/platforms");
	return data.platforms;
};

export type PlatformSettings = { settings: PlatformSetting[]; rules: PlatformRule[] };

/** The limits a workflow on platform `version` can override, and the rules between them (its manifest's `settings`/`rules`). */
export const getPlatformSettings = async (version: string): Promise<PlatformSettings> => {
	const { data } = await http.get<PlatformSettings>(`/platforms/${encodeURIComponent(version)}/settings`);
	return data;
};
