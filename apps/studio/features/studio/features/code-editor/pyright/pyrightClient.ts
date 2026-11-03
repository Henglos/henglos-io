import {
	AbstractMessageReader,
	AbstractMessageWriter,
	createMessageConnection,
	type DataCallback,
	type Disposable,
	type Message,
	type MessageConnection,
	type MessageReader,
	type MessageWriter,
} from "vscode-jsonrpc/browser";
import type {
	CompletionItem,
	CompletionList,
	Hover,
	InitializeParams,
	Position,
	PublishDiagnosticsParams,
	SignatureHelp,
} from "vscode-languageserver-protocol";

// The code editor's language server: basedpyright's browser build
// (browser-basedpyright, copied to public/ by scripts/sync-pyright-worker.mjs)
// running in a Web Worker, with the official MicroPython stubs for the board's
// port as its typeshed (scripts/pack-micropython-stubs.py). One server for
// the whole page, booted the first time a code editor opens.
//
// Protocol (packages/browser-pyright in basedpyright): the page posts
// `browser/boot` (mode "foreground") and then speaks LSP over postMessage.
// The server spawns background analysis workers by posting `browser/newWorker`
// back; the page has to start those itself and boot them in "background" mode
// with the MessagePort it was given. Files — stubs, config — are handed over
// in `initialize` as `initializationOptions.files` and live in its memory FS.

const WORKER_URL = "/pyright/pyright.worker.js";
const STUBS_URL = "/pyright/micropython-esp32.json";

const ROOT = "/src";
export const ROOT_URI = `file://${ROOT}`;

// `ctx` as the board's scripts see it (hio/system/core/Context.py ScriptContext).
const CTX_STUB = `class Context:
    """The script's view of the workflow pipeline — read-only. A script computes a value and returns it; it doesn't publish outputs."""

    def get(self, name: str) -> int | float | bool | bytes | None:
        """Reads a value: one of this action's other configs ("<action>/<config>"), an output published by an action that ran before (its output name), or else a workflow variable by that name. None if there isn't one."""
        ...

    def var(self, name: str) -> int | float | bool | bytes | None:
        """Reads a workflow variable (Variables list, written by Variables / Set) — kept across loops of the program. None while it has no value."""
        ...
`;

// typeshedPath swaps CPython's stdlib for micropython-stdlib-stubs' and
// stubPath adds the port's modules (machine, network, esp32, …) — the layout
// micropython-stubs is made for.
const PYRIGHT_CONFIG = {
	typeshedPath: "/typings",
	stubPath: "/typings",
	typeCheckingMode: "standard",
	reportMissingModuleSource: "none",
};

type StubsBundle = { source: string; version: string; files: Record<string, string> };

/** Worker → jsonrpc, skipping the boot protocol's own messages. */
class WorkerReader extends AbstractMessageReader implements MessageReader {
	private callback: DataCallback | null = null;

	constructor(private readonly worker: Worker, private readonly onNewWorker: (data: { initialData: unknown; port: MessagePort }) => void) {
		super();
		worker.addEventListener("message", event => {
			const data = event.data;
			if (data?.type === "browser/newWorker") onNewWorker(data);
			else this.callback?.(data as Message);
		});
		worker.addEventListener("error", event => this.fireError(event));
	}

	listen(callback: DataCallback): Disposable {
		this.callback = callback;
		return { dispose: () => { this.callback = null; } };
	}
}

class WorkerWriter extends AbstractMessageWriter implements MessageWriter {
	constructor(private readonly worker: Worker) {
		super();
	}

	async write(message: Message) {
		this.worker.postMessage(message);
	}

	end() {}
}

type DiagnosticsListener = (params: PublishDiagnosticsParams) => void;

export class PyrightClient {

	private readonly diagnosticsListeners = new Map<string, DiagnosticsListener>();

	private constructor(private readonly connection: MessageConnection) {
		connection.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
			this.diagnosticsListeners.get(params.uri)?.(params);
		});
		// Server → client requests: settings come from pyrightconfig.json, the
		// rest (capability registration, progress) needs no answer beyond null.
		connection.onRequest((method, params) => {
			if (method === "workspace/configuration") return (params as { items: unknown[] }).items.map(() => ({}));
			return null;
		});
	}

	static async start(): Promise<PyrightClient> {

		const stubs = fetch(STUBS_URL).then(response => {
			if (!response.ok) throw new Error(`MicroPython stubs: HTTP ${response.status}`);
			return response.json() as Promise<StubsBundle>;
		});

		const foreground = new Worker(WORKER_URL, { name: "pyright-foreground" });
		const background: Worker[] = [];

		const connection = createMessageConnection(
			new WorkerReader(foreground, ({ initialData, port }) => {
				const worker = new Worker(WORKER_URL, { name: `pyright-background-${background.length + 1}` });
				background.push(worker);
				worker.postMessage({ type: "browser/boot", mode: "background", initialData, port }, [port]);
			}),
			new WorkerWriter(foreground),
		);

		const client = new PyrightClient(connection);
		connection.listen();
		foreground.postMessage({ type: "browser/boot", mode: "foreground" });

		const { files } = await stubs;

		await connection.sendRequest("initialize", {
			processId: null,
			rootUri: ROOT_URI,
			workspaceFolders: [{ uri: ROOT_URI, name: "scripts" }],
			capabilities: {
				textDocument: {
					synchronization: { didSave: false, dynamicRegistration: false },
					completion: {
						completionItem: {
							snippetSupport: true,
							documentationFormat: ["markdown", "plaintext"],
							resolveSupport: { properties: ["documentation", "detail"] },
							tagSupport: { valueSet: [1] },
						},
						contextSupport: true,
					},
					hover: { contentFormat: ["markdown", "plaintext"] },
					signatureHelp: {
						signatureInformation: {
							documentationFormat: ["markdown", "plaintext"],
							parameterInformation: { labelOffsetSupport: true },
							activeParameterSupport: true,
						},
						contextSupport: true,
					},
					publishDiagnostics: { tagSupport: { valueSet: [1, 2] } },
				},
				workspace: { configuration: true, workspaceFolders: true },
			},
			initializationOptions: {
				files: {
					...files,
					"/typings/_hio_ctx.pyi": CTX_STUB,
					[`${ROOT}/pyrightconfig.json`]: JSON.stringify(PYRIGHT_CONFIG),
				},
			},
		} satisfies InitializeParams & { initializationOptions: unknown });

		await connection.sendNotification("initialized", {});
		return client;
	}

	open(uri: string, text: string) {
		void this.connection.sendNotification("textDocument/didOpen", { textDocument: { uri, languageId: "python", version: 1, text } });
	}

	change(uri: string, version: number, text: string) {
		void this.connection.sendNotification("textDocument/didChange", { textDocument: { uri, version }, contentChanges: [{ text }] });
	}

	close(uri: string) {
		this.diagnosticsListeners.delete(uri);
		void this.connection.sendNotification("textDocument/didClose", { textDocument: { uri } });
	}

	onDiagnostics(uri: string, listener: DiagnosticsListener) {
		this.diagnosticsListeners.set(uri, listener);
	}

	completion(uri: string, position: Position, triggerCharacter?: string) {
		return this.connection.sendRequest<CompletionList | CompletionItem[] | null>("textDocument/completion", {
			textDocument: { uri },
			position,
			context: triggerCharacter ? { triggerKind: 2, triggerCharacter } : { triggerKind: 1 },
		});
	}

	resolveCompletion(item: CompletionItem) {
		return this.connection.sendRequest<CompletionItem>("completionItem/resolve", item);
	}

	hover(uri: string, position: Position) {
		return this.connection.sendRequest<Hover | null>("textDocument/hover", { textDocument: { uri }, position });
	}

	signatureHelp(uri: string, position: Position) {
		return this.connection.sendRequest<SignatureHelp | null>("textDocument/signatureHelp", { textDocument: { uri }, position });
	}
}

let clientPromise: Promise<PyrightClient> | null = null;

/** The page's single server — booted on first use; a failed boot can be retried. */
export const getPyrightClient = () => {
	clientPromise ??= PyrightClient.start().catch(error => {
		clientPromise = null;
		throw error;
	});
	return clientPromise;
};
