import type { AccountOut } from "@henglosio/shared";
import { http } from "@shared/lib/http";

export const getAccount = async (): Promise<AccountOut> => {
	const { data } = await http.get<AccountOut>("/accounts");
	return data;
};

export const deleteAccount = async (): Promise<void> => {
	await http.delete("/accounts");
};
