import { container, instanceCachingFactory } from "tsyringe";

// ── Infrastructure ────────────────────────────────────────────────────────────
import { SocketIOClient } from "./infrastructure/ws/SocketIOClient.impl.js";
import { DockerRuntimeImpl } from "./infrastructure/container-runtime/DockerRuntime.impl.js";

// ── Application services ──────────────────────────────────────────────────────
import { ConfigStore } from "./application/services/ConfigStore.service.js";
import { WorkflowService } from "./application/services/WorkflowService.service.js";
import { PackageService } from "./application/services/PackageService.service.js";
import { USBTunnel } from "./application/services/USBTunnel.service.js";
import { ContainerTunnel } from "./application/services/ContainerTunnel.service.js";
import { DeviceWatcher } from "./application/services/DeviceWatcher.service.js";
import { LockManager } from "./application/services/LockManager.service.js";
import { TaskManager } from "./application/services/TaskManager.service.js";
import { TaskCommandRegistry } from "./application/commands/TaskCommand.registry.js";

// ── Use cases ─────────────────────────────────────────────────────────────────
import { CheckDriverLoggedUseCase } from "./application/use-cases/auth/CheckDriverLogged.use-case.js";
import { LoginDriverUseCase } from "./application/use-cases/auth/LoginDriver.use-case.js";
import { ConfigureDriverUseCase } from "./application/use-cases/auth/ConfigureDriver.use-case.js";
import { CompileWorkflowUseCase } from "./application/use-cases/workflow/CompileWorkflow.use-case.js";

// ── Presentation ──────────────────────────────────────────────────────────────
import { GatewayWS } from "./presentation/Gateway.ws.js";
import { CreateWorkflowUseCase } from "./application/use-cases/workflow/CreateWorkflow.use-case.js";
import { DeleteWorkflowUseCase } from "./application/use-cases/workflow/DeleteWorkflow.use-case.js";
import { SyncWorkflowUseCase } from "./application/use-cases/workflow/SyncWorkflow.use-case.js";
import { SyncWorkflowsUseCase } from "./application/use-cases/workflow/SyncWorkflows.use-case.js";
import { ListDevicesUseCase } from "./application/use-cases/devices/ListDevices.use-case.js";
import { FlashWorkflowUseCase } from "./application/use-cases/workflow/FlashWorkflow.use-case.js";
import { ExecuteSessionsService } from "./application/services/ExecuteSessions.service.js";
import { ReplTerminalsService } from "./application/services/ReplTerminals.service.js";
import { RecordWorkflowUseCase } from "./application/use-cases/workflow/RecordWorkflow.use-case.js";
import { RemovePackageUseCase } from "./application/use-cases/package/RemovePackage.use-case.js";
import { createLogger } from "./infrastructure/logger/Logger.js";

const log = createLogger("driver");

// ── Factories (parâmetros primitivos) ─────────────────────────────────────────

container.register(ContainerTunnel, {
	useFactory: instanceCachingFactory<ContainerTunnel>(
		() => new ContainerTunnel(),
	),
});

container.register("IContainerRuntime", {
	useClass: DockerRuntimeImpl,
});

// ── Singletons ────────────────────────────────────────────────────────────────

container.registerSingleton(ConfigStore);
container.registerSingleton(SocketIOClient);
container.registerSingleton(WorkflowService);
container.registerSingleton(PackageService);
container.registerSingleton(USBTunnel);
container.registerSingleton(ContainerTunnel);
container.registerSingleton(DeviceWatcher);
container.registerSingleton(LockManager);
container.registerSingleton(TaskManager);
container.registerSingleton(TaskCommandRegistry);

container.registerSingleton(CheckDriverLoggedUseCase);
container.registerSingleton(LoginDriverUseCase);
container.registerSingleton(ConfigureDriverUseCase);

container.registerSingleton(CompileWorkflowUseCase);
container.registerSingleton(FlashWorkflowUseCase);
container.registerSingleton(ExecuteSessionsService);
container.registerSingleton(ReplTerminalsService);
container.registerSingleton(RecordWorkflowUseCase);
container.registerSingleton(CreateWorkflowUseCase);
container.registerSingleton(DeleteWorkflowUseCase);
container.registerSingleton(SyncWorkflowUseCase);
container.registerSingleton(SyncWorkflowsUseCase);
container.registerSingleton(RemovePackageUseCase);

container.registerSingleton(ListDevicesUseCase);

container.registerSingleton(GatewayWS);

// Decodes a JWT's `exp` claim without verifying the signature (that's the
// hosting's job) — just so the daemon fails with a clear message instead of
// silently connecting and getting kicked in handleConnection.
const isTokenExpired = (token: string): boolean => {
	try {
		const [, payload] = token.split(".");
		if (!payload) return false;
		const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
		return typeof claims.exp === "number" && claims.exp * 1000 <= Date.now();
	} catch {
		return false;
	}
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────

export const runDaemon = async (): Promise<void> => {

	log.info(`Starting the driver (pid ${process.pid})`);
	// What would otherwise end the process without a word.
	process.on("unhandledRejection", reason => log.error("Unhandled rejection:", reason));
	const configStore = container.resolve(ConfigStore);
	const packageService = container.resolve(PackageService);
	const workflowService = container.resolve(WorkflowService);
	const usbTunnel = container.resolve(USBTunnel);
	const containerTunnel = container.resolve(ContainerTunnel);
	const containerRuntime = container.resolve(DockerRuntimeImpl);
	const ws = container.resolve(SocketIOClient);

	await configStore.initialize();
	await packageService.initialize();
	await workflowService.initialize();
	await usbTunnel.initialize();
	await containerTunnel.initialize();
	await containerRuntime.ensureNetwork("henglos-internal", {
		internal: true,
	});

	if (!(await container.resolve(CheckDriverLoggedUseCase).execute())) {
		throw new Error("[auth] Driver not logged in. Run 'hio driver configure <baseUrl>' then 'hio driver login <pairToken> <name>' first.");
	}

	const { token, baseUrl } = await configStore.read();
	if (token && baseUrl) {
		if (isTokenExpired(token)) {
			throw new Error("[auth] Driver token expired. Run 'hio driver login <pairToken> <name>' again.");
		}

		const wsHost = `${baseUrl.replace(/^http/, "ws")}/driver`;
		await ws.connect(wsHost, token);
	}

	container.resolve(GatewayWS);
	await container.resolve(DeviceWatcher).start();
	log.ready("Driver ready — watching for boards");
};
