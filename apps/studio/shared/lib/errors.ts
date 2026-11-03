// Plain-language messages for the backend's error ids (BaseError's `id`), keyed
// exactly as the server sends them in `{ id, info }`.
const ERROR_MESSAGES: Record<string, string> = {
	// ── auth ──────────────────────────────────────────────────────────────────
	email_already_exists:         "Este email já está em uso.",
	username_already_exists:      "Este nome de usuário já está em uso.",
	user_alredy_registerd:        "Esta conta já foi registrada.",
	wrong_auth_credentials:       "Email ou senha incorretos.",
	invalid_email:                "Email inválido.",
	invalid_password:             "Senha inválida.",
	invalid_username:             "Nome de usuário inválido.",
	required_email:               "Informe o email.",
	required_password:            "Informe a senha.",
	required_username:            "Informe o nome de usuário.",
	required_user:                "Usuário obrigatório.",
	invalid_token:                "Sua sessão expirou. Faça login novamente.",
	expired_token:                "Sua sessão expirou. Faça login novamente.",
	user_not_found:               "Sua conta não foi encontrada. Faça login novamente.",
	invalid_auth_strategy:        "Método de autenticação inválido.",
	operation_not_permitted:      "Você não tem permissão para esta operação.",

	// ── workflow ──────────────────────────────────────────────────────────────
	workflow_not_found:           "Workflow não encontrado.",
	workflow_name_already_in_use: "Já existe um workflow com este nome.",
	invalid_workflow_name:        "Nome de workflow inválido.",
	required_workflow:            "Workflow obrigatório.",
	action_not_found:             "Ação não encontrada no workflow.",

	// ── driver ────────────────────────────────────────────────────────────────
	driver_not_found:             "Driver não encontrado.",
	driver_offline:               "O driver está offline.",
	driver_error:                 "O driver retornou um erro.",
	driver_already_exists:        "Este driver já está pareado.",
	required_driver:              "Selecione um driver.",
	wrong_pair_token:             "Token de pareamento inválido ou expirado.",

	// ── task ──────────────────────────────────────────────────────────────────
	task_not_found:               "Tarefa não encontrada (pode já ter terminado).",
	invalid_task_transition:      "A tarefa não está num estado que permite esta ação.",

	// ── package / platform ───────────────────────────────────────────────────
	package_not_found:            "Pacote não encontrado.",
	package_already_exists:       "Este pacote já existe.",
	package_already_linked:       "Este pacote já está na sua biblioteca.",
	package_in_use:               "Este componente está em uso por um workflow e não pode ser removido.",
	workflow_without_board:       "Este workflow está sem board — escolha um em Edit, no hub, antes de compilar.",
	invalid_package_type:         "Tipo de pacote inválido.",
	invalid_package_schema:       "O schema do pacote é inválido.",
	cannot_load_package:          "Não foi possível carregar o pacote.",
	manifest_not_found:           "O manifesto do pacote não foi encontrado.",
	platform_not_found:           "Plataforma não encontrada.",
	incompatible_platform_version:"Versão de plataforma incompatível.",
	firmware_not_found_in_registry:"Firmware não encontrado no registry.",
	sdk_not_found_in_registry:    "SDK não encontrado no registry.",
	registry_download_failed:     "Falha ao baixar do registry de pacotes.",
	registry_package_not_found:   "Pacote não encontrado no registry.",

	// ── credentials ──────────────────────────────────────────────────────────
	credential_not_found:         "Credencial não encontrada.",
	credential_type_not_found:    "Nenhum componente instalado declara esse tipo de credencial.",
	invalid_credential:           "Os campos da credencial não são válidos.",
	credential_missing:           "Uma credencial usada pelo workflow não existe mais — escolha outra na config.",

	// ── generic ──────────────────────────────────────────────────────────────
	service_unavailable:          "Serviço temporariamente indisponível.",
	internal_error:               "Erro interno do servidor.",
};

export function resolveErrorMessage(id: string): string {
	return ERROR_MESSAGES[id] ?? "Ocorreu um erro inesperado.";
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
	400: "Requisição inválida",
	401: "Você precisa entrar de novo",
	403: "Sem permissão para isso",
	404: "Não encontrado",
	409: "Conflito com o estado atual",
	429: "Muitas requisições — aguarde um momento",
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
				message: "A requisição demorou demais",
				detail: "O servidor não respondeu a tempo. Verifique sua conexão e tente novamente.",
				code: ax.code ?? "timeout",
			};
		}
		return {
			message: "Sem conexão com o servidor",
			detail: "Não foi possível alcançar o backend. Ele pode estar reiniciando — tente de novo em alguns segundos.",
			code: ax.code ?? "network_error",
		};
	}

	const status = ax.response.status ?? 0;
	const id = ax.response.data?.id ?? "unknown";
	const info = ax.response.data?.info;

	// Gateway / upstream errors (Caddy in front of the backend).
	if (status === 502 || status === 503 || status === 504) {
		return {
			message: "Servidor indisponível",
			detail: "O backend está fora do ar ou reiniciando. Aguarde alguns segundos e tente de novo.",
			code: `HTTP ${status}`,
		};
	}

	if (status >= 500) {
		return {
			message: "Erro interno do servidor",
			detail: info ?? "Algo falhou no servidor ao processar a requisição.",
			code: id !== "unknown" ? id : `HTTP ${status}`,
		};
	}

	// A known business error id → its friendly message, with any server detail.
	if (ERROR_MESSAGES[id]) {
		return { message: ERROR_MESSAGES[id]!, detail: info, code: id };
	}

	// Unknown 4xx → headline by status, keep whatever detail the server gave.
	return {
		message: STATUS_HEADLINE[status] ?? "Ocorreu um erro inesperado",
		detail: info,
		code: id !== "unknown" ? id : `HTTP ${status || "?"}`,
	};
}
