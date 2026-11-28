import axios from "axios";
import { emitToast } from "@henglosio/ui";
import { getCookie, setCookie, removeCookie } from "./cookies";
import { ApiError, describeRequestError } from "./errors";

const BASE_URL = "/io/api/v1";
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

declare module "axios" {
	interface AxiosRequestConfig {
		/** Fails without the error toast — for requests the user didn't ask for (a background check). */
		silent?: boolean;
	}
}

export const http = axios.create({ baseURL: BASE_URL });

http.interceptors.request.use(config => {
	const token = getCookie("accessToken");
	if (token) config.headers.Authorization = `Bearer ${token}`;
	return config;
});

let isRefreshing = false;
let pendingQueue: Array<{
	retry: (token: string) => void;
	reject: (err: unknown) => void;
}> = [];

const LOGIN_PATH = "/auth/login";
const SETUP_PATH = "/auth/setup";

async function handleAuthFailure(): Promise<void> {
	removeCookie("accessToken");
	removeCookie("refreshToken");

	if (typeof window === "undefined") return;
	if (window.location.pathname.startsWith(LOGIN_PATH) || window.location.pathname.startsWith(SETUP_PATH)) return;

	try {
		const { data } = await axios.get(`${BASE_URL}/auth/setup-status`);
		window.location.href = data.hasUser ? LOGIN_PATH : SETUP_PATH;
	} catch {
		window.location.href = LOGIN_PATH;
	}
}

http.interceptors.response.use(
	response => response,
	async error => {
		const config   = error.config;
		const errorId  = error.response?.data?.id ?? "unknown";
		const errorInfo = error.response?.data?.info;

		if (errorId === "expired_token" && !config._retry) {
			const storedRefresh = getCookie("refreshToken");

			if (!storedRefresh) {
				const err = new ApiError("invalid_token");
				emitToast("error", "Your session expired", {
					detail: "Sign in again to continue.",
					code: "invalid_token",
				});
				void handleAuthFailure();
				return Promise.reject(err);
			}

			if (isRefreshing) {
				return new Promise((resolve, reject) => {
					pendingQueue.push({
						retry: token => {
							config.headers.Authorization = `Bearer ${token}`;
							resolve(http(config));
						},
						reject,
					});
				});
			}

			config._retry = true;
			isRefreshing  = true;

			try {
				const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
					refreshToken: storedRefresh,
				});
				setCookie("accessToken", data.accessToken);
				setCookie("refreshToken", data.refreshToken, REFRESH_MAX_AGE);
				http.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
				pendingQueue.forEach(({ retry }) => retry(data.accessToken));
				pendingQueue = [];
				config.headers.Authorization = `Bearer ${data.accessToken}`;
				return http(config);
			} catch (refreshError) {
				pendingQueue.forEach(({ reject }) => reject(refreshError));
				pendingQueue = [];
				const err = new ApiError("invalid_token");
				emitToast("error", "Your session expired", {
					detail: "Sign in again to continue.",
					code: "invalid_token",
				});
				void handleAuthFailure();
				return Promise.reject(err);
			} finally {
				isRefreshing = false;
			}
		}

		// A request made in the background (`silent`) fails without a toast.
		if (!config?.silent) {
			const display = describeRequestError(error);
			emitToast("error", display.message, { detail: display.detail, code: display.code });
		}

		if (errorId === "invalid_token" || errorId === "user_not_found") {
			void handleAuthFailure();
		}

		return Promise.reject(new ApiError(errorId, errorInfo));
	},
);
