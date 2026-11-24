// Plain-language messages for the backend's error ids (BaseError's `id`), keyed
// exactly as the server sends them in `{ id, info }`.
const ERROR_MESSAGES: Record<string, string> = {
	// ── auth ──────────────────────────────────────────────────────────────────
	email_already_exists:         "This email is already in use.",
	username_already_exists:      "This username is already in use.",
	user_alredy_registerd:        "This account is already registered.",
	wrong_auth_credentials:       "Wrong email or password.",
	invalid_email:                "Invalid email.",
	invalid_password:             "Invalid password.",
	invalid_username:             "Invalid username.",
	required_email:               "Enter your email.",
	required_password:            "Enter your password.",
	required_username:            "Enter your username.",
	required_user:                "A user is required.",
	invalid_token:                "Your session expired. Sign in again.",
	expired_token:                "Your session expired. Sign in again.",
	user_not_found:               "Your account wasn't found. Sign in again.",
	invalid_auth_strategy:        "Invalid authentication method.",
	operation_not_permitted:      "You don't have permission to do this.",

	// ── workflow ──────────────────────────────────────────────────────────────
	workflow_not_found:           "Workflow not found.",
	workflow_name_already_in_use: "A workflow with this name already exists.",
	invalid_workflow_name:        "Invalid workflow name.",
	required_workflow:            "A workflow is required.",
	action_not_found:             "Action not found in the workflow.",
	invalid_workflow_archive:     "This .hio file can't be imported.",
	import_package_failed:        "A package the workflow needs couldn't be installed.",

	// ── driver ────────────────────────────────────────────────────────────────
	driver_not_found:             "Driver not found.",
	driver_offline:               "The driver is offline.",
	driver_error:                 "The driver returned an error.",
	driver_already_exists:        "This driver is already paired.",
	required_driver:              "Select a driver.",
	wrong_pair_token:             "Invalid or expired pairing token.",

	// ── task ──────────────────────────────────────────────────────────────────
	task_not_found:               "Task not found (it may have already finished).",
	invalid_task_transition:      "The task isn't in a state that allows this.",

	// ── package / platform ───────────────────────────────────────────────────
	package_not_found:            "Package not found.",
	package_already_exists:       "This package already exists.",
	package_already_linked:       "This package is already in your library.",
	package_in_use:               "This component is used by a workflow and can't be removed.",
	workflow_without_board:       "This workflow has no board — pick one in Edit, on the hub, before compiling.",
	invalid_package_type:         "Invalid package type.",
	invalid_package_schema:       "The package's schema is invalid.",
	cannot_load_package:          "Couldn't load the package.",
	manifest_not_found:           "The package's manifest wasn't found.",
	platform_not_found:           "Platform not found.",
	invalid_platform_settings:    "A limit in Settings → Limits isn't allowed by this platform version.",
	incompatible_platform_version:"Incompatible platform version.",
	firmware_not_found_in_registry:"Firmware not found in the registry.",
	sdk_not_found_in_registry:    "SDK not found in the registry.",
	registry_download_failed:     "Downloading from the package registry failed.",
	registry_package_not_found:   "Package not found in the registry.",

	// ── credentials ──────────────────────────────────────────────────────────
	credential_not_found:         "Credential not found.",
	credential_type_not_found:    "No installed component declares this credential type.",
	invalid_credential:           "The credential's fields aren't valid.",
	credential_missing:           "A credential the workflow uses no longer exists — pick another one in the config.",

	// ── generic ──────────────────────────────────────────────────────────────
	too_many_requests:            "Too many attempts — wait a moment and try again.",
	service_unavailable:          "Service temporarily unavailable.",
	internal_error:               "Internal server error.",
};

export function resolveErrorMessage(id: string): string {
	return ERROR_MESSAGES[id] ?? "An unexpected error occurred.";
}

export class ApiError extends Error {
	constructor(
		public readonly id: string,
		public readonly info?: string,
	) {
		super(resolveErrorMessage(id));
		this.name = "ApiError";
	}
}

// ── request-error presentation ──────────────────────────────────────────────

export interface RequestErrorDisplay {
	/** Short headline, plain language. */
	message: string;
	/** What it means / what to do — optional secondary line. */
	detail?: string;
	/** Machine code for the toast's copyable chip. */
	code: string;
}

const STATUS_HEADLINE: Record<number, string> = {
	400: "Invalid request",
	401: "You need to sign in again",
	403: "You don't have permission for this",
	404: "Not found",
	409: "Conflicts with the current state",
	429: "Too many requests — wait a moment",
};

type AxiosLikeError = {
	code?: string;
	message?: string;
	response?: { status?: number; data?: { id?: string; info?: string } | undefined };
};

/**
 * Turns whatever axios (or fetch) threw into something a human can act on:
 * a headline, an optional explanation, and a support code. Handles the cases
 * the raw `{ id, info }` mapping misses — no connection, timeouts, gateway
 * errors, bare 5xx.
 */
export function describeRequestError(error: unknown): RequestErrorDisplay {
	const ax = (error ?? {}) as AxiosLikeError;

	// No response at all — network down, CORS, DNS, server not listening…
	if (!ax.response) {
		if (ax.code === "ECONNABORTED" || /timeout/i.test(ax.message ?? "")) {
			return {
				message: "The request took too long",
				detail: "The server didn't answer in time. Check your connection and try again.",
				code: ax.code ?? "timeout",
			};
		}
		return {
			message: "No connection to the server",
			detail: "Couldn't reach the backend. It may be restarting — try again in a few seconds.",
			code: ax.code ?? "network_error",
		};
	}

	const status = ax.response.status ?? 0;
	const id = ax.response.data?.id ?? "unknown";
	const info = ax.response.data?.info;

	// Gateway / upstream errors (Caddy in front of the backend).
	if (status === 502 || status === 503 || status === 504) {
		return {
			message: "Server unavailable",
			detail: "The backend is down or restarting. Wait a few seconds and try again.",
			code: `HTTP ${status}`,
		};
	}

	if (status >= 500) {
		return {
			message: "Internal server error",
			detail: info ?? "Something failed on the server while handling the request.",
			code: id !== "unknown" ? id : `HTTP ${status}`,
		};
	}

	// The rate limit: its info is the seconds to wait.
	if (id === "too_many_requests") {
		return { message: ERROR_MESSAGES[id]!, detail: info ? `Try again in ${info} s.` : undefined, code: id };
	}

	// A known business error id → its friendly message, with any server detail.
	if (ERROR_MESSAGES[id]) {
		return { message: ERROR_MESSAGES[id]!, detail: info, code: id };
	}

	// Unknown 4xx → headline by status, keep whatever detail the server gave.
	return {
		message: STATUS_HEADLINE[status] ?? "An unexpected error occurred",
		detail: info,
		code: id !== "unknown" ? id : `HTTP ${status || "?"}`,
	};
}
