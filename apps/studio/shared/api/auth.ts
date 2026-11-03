import type { RegisterUserIn, LoginUserOut, SetupStatusOut } from "@henglosio/shared";
import { setCookie, removeCookie } from "@shared/lib/cookies";
import { http } from "@shared/lib/http";

export type RegisterPayload = RegisterUserIn;

const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

export const loginUser = async (email: string, password: string): Promise<void> => {
	const { data } = await http.post<LoginUserOut>("/auth/login/local", { email, password });
	setCookie("accessToken", data.accessToken);
	setCookie("refreshToken", data.refreshToken, REFRESH_MAX_AGE);
};

export const registerUser = async (payload: RegisterPayload): Promise<void> => {
	await http.post("/auth/register", payload);
};

export const logoutUser = (): void => {
	removeCookie("accessToken");
	removeCookie("refreshToken");
};

export const getSetupStatus = async (): Promise<SetupStatusOut> => {
	const { data } = await http.get<SetupStatusOut>("/auth/setup-status");
	return data;
};
