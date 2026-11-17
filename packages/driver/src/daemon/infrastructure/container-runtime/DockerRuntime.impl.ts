import path from "node:path";
import Dockerode from "dockerode";
import { Writable, Readable } from "node:stream";
import { Parser } from "tar";
import { injectable } from "tsyringe";
import type {
	Container,
	ContainerCreateOptions,
	ExecOptions,
	ExecResult,
	NetworkCreateOptions,
} from "../../domain/interfaces/IContainerRuntime.interface.js";
import { IContainerRuntime } from "../../domain/interfaces/IContainerRuntime.interface.js";

const LOOPBACK = "127.0.0.1";

/** IContainerRuntime on Docker (dockerode, the local daemon's socket). */
@injectable()
export class DockerRuntimeImpl extends IContainerRuntime {

	private docker: Dockerode;

	constructor() {
		super();
		this.docker = new Dockerode();
	}

	async createContainer(options: ContainerCreateOptions): Promise<Container> {
		const mounts = (options.volumes ?? []).map(v => ({
			Type: v.volume !== undefined ? "volume" as const : "bind" as const,
			Source: v.volume ?? v.hostPath!.replace(/\\/g, "/"),
			Target: v.containerPath,
			ReadOnly: v.readOnly ?? false,
		}));

		const devices = (options.devices ?? []).map(d => ({
			PathOnHost: d.hostPath,
			PathInContainer: d.containerPath,
			CgroupPermissions: d.permissions ?? "rwm",
		}));

		const portBindings: Record<string, Array<{ HostPort: string }>> = {};
		const exposedPorts: Record<string, {}> = {};
		for (const p of options.ports ?? []) {
			const proto = p.protocol ?? "tcp";
			const key = `${p.containerPort}/${proto}`;
			exposedPorts[key] = {};
			portBindings[key] = [{ HostPort: String(p.hostPort) }];
		}

		const networkMode = this.resolveNetworkMode(options.network);

		const imageName = this.buildImageName(options.image.name, options.image.registry);

		const container = await this.docker.createContainer({
			name: options.name,
			Image: imageName,
			Cmd: options.cmd,
			Env: options.env ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`) : undefined,
			Labels: options.labels,
			ExposedPorts: Object.keys(exposedPorts).length ? exposedPorts : undefined,
			HostConfig: {
				Mounts: mounts.length ? mounts : undefined,
				Devices: devices.length ? devices : undefined,
				NetworkMode: networkMode,
				PortBindings: Object.keys(portBindings).length ? portBindings : undefined,
				Privileged: options.privileged ?? false,
				ExtraHosts: options.extraHosts,
			},
		});

		const info = await container.inspect();
		return { id: info.Id, name: options.name ?? info.Name.replace(/^\//, "") };
	}

	async startContainer(nameOrId: string): Promise<void> {
		const container = this.docker.getContainer(nameOrId);
		try {
			await container.start();
		} catch (err) {
			const info = await container.inspect();
			if (!info.State.Running) throw err;
		}
	}

	async stopContainer(nameOrId: string): Promise<void> {
		await this.docker.getContainer(nameOrId).stop();
	}

	async removeContainer(nameOrId: string): Promise<void> {
		try {
			const container = this.docker.getContainer(nameOrId);
			const info = await container.inspect();
			if (info.State.Running) await container.stop();
			await container.remove();
		} catch {
			// container doesn't exist — treat as success
		}
	}

	async containerExists(nameOrId: string): Promise<boolean> {
		return this.docker.getContainer(nameOrId).inspect().then(() => true).catch(() => false);
	}

	async getContainerLabel(nameOrId: string, label: string): Promise<string | null> {
		const info = await this.docker.getContainer(nameOrId).inspect();
		return info.Config.Labels?.[label] ?? null;
	}

	async execCommand(nameOrId: string, cmd: string[], options?: ExecOptions): Promise<ExecResult> {
		const container = this.docker.getContainer(nameOrId);
		const baseEnv = { HOME: "/root" };
		const mergedEnv = { ...baseEnv, ...(options?.env ?? {}) };

		const exec = await container.exec({
			Cmd: cmd,
			AttachStdout: true,
			AttachStderr: true,
			WorkingDir: options?.workingDir,
			Env: Object.entries(mergedEnv).map(([k, v]) => `${k}=${v}`),
			User: options?.user,
		});

		const stream = await exec.start({ hijack: true, stdin: false });

		const stdout: string[] = [];
		const stderr: string[] = [];

		await new Promise<void>((resolve, reject) => {

			const signal = options?.signal;

			const onAbort = () => {
				cleanup();
				// Killing the container is the clean way to stop an exec's process
				// tree — the build/flash container is per-workflow and disposable.
				this.stopContainer(nameOrId).catch(() => {});
				reject(new Error("aborted"));
			};

			const cleanup = () => signal?.removeEventListener("abort", onAbort);

			if (signal?.aborted) return onAbort();
			signal?.addEventListener("abort", onAbort);

			const makeWriter = (bucket: string[]) => new Writable({
				write(chunk: Buffer, _enc, cb) {
					const text = chunk.toString();
					bucket.push(text);
					options?.onLog?.(text);
					cb();
				},
			});
			this.docker.modem.demuxStream(stream, makeWriter(stdout), makeWriter(stderr));
			stream.on("end", () => { cleanup(); resolve(); });
			stream.on("error", (err) => { cleanup(); reject(err); });
		});

		const info = await exec.inspect();
		return {
			exitCode: info.ExitCode ?? -1,
			stdout: stdout.join(""),
			stderr: stderr.join(""),
		};
	}

	async copyToContainer(nameOrId: string, containerPath: string, content: Buffer): Promise<void> {
		const filename = path.posix.basename(containerPath);
		const destDir  = path.posix.dirname(containerPath);
		const tar = buildSingleFileTar(filename, content);
		const container = this.docker.getContainer(nameOrId);
		await container.putArchive(Readable.from(tar), { path: destDir });
	}

	async copyFromContainer(nameOrId: string, containerPath: string): Promise<Buffer> {
		const container = this.docker.getContainer(nameOrId);
		const archive = await container.getArchive({ path: containerPath });

		return new Promise<Buffer>((resolve, reject) => {
			const chunks: Buffer[] = [];
			const parser = new Parser();

			parser.on("entry", (entry: NodeJS.ReadableStream & { type: string }) => {
				entry.on("data", (chunk: Buffer) => chunks.push(chunk));
				entry.on("end", () => resolve(Buffer.concat(chunks)));
				entry.on("error", reject);
			});

			parser.on("error", reject);
			(archive as unknown as NodeJS.ReadableStream).pipe(parser as unknown as NodeJS.WritableStream);
		});
	}

	async imageExists(image: string, options: { registry?: string; username?: string; password?: string }): Promise<boolean> {
		const fullName = this.buildImageName(image, options.registry);
		return this.docker.getImage(fullName).inspect().then(() => true).catch(() => false);
	}

	async pullImage(image: string, options: { registry?: string; username?: string; password?: string }, onProgress?: (msg: string) => void): Promise<void> {
		const fullName = this.buildImageName(image, options.registry);
		const authconfig = options.username
			? { username: options.username, password: options.password, serveraddress: options.registry }
			: undefined;

		await new Promise<void>((resolve, reject) => {
			this.docker.pull(fullName, { authconfig }, (err: Error | null, stream?: NodeJS.ReadableStream) => {
				if (err || !stream) return reject(err ?? new Error("pull returned no stream"));
				this.docker.modem.followProgress(
					stream,
					(followErr: Error | null) => {
						if (followErr) return reject(followErr);
						resolve();
					},
					(event: Record<string, unknown>) => {
						if (!onProgress) return;
						const status = String(event["status"] ?? "").trim();
						const id = event["id"] ? `[${event["id"]}] ` : "";
						const progress = event["progress"] ? ` ${event["progress"]}` : "";
						if (status) onProgress(`${id}${status}${progress}`);
					},
				);
			});
		});
	}

	async ensureNetwork(name: string, options?: NetworkCreateOptions): Promise<void> {
		try {
			await this.docker.getNetwork(name).inspect();
		} catch {
			await this.docker.createNetwork({
				Name: name,
				Driver: options?.driver ?? "bridge",
				Internal: options?.internal ?? false,
			});
		}
	}

	// Docker Desktop (Windows, macOS, and Linux too) forwards host.docker.internal
	// to the host's loopback. A native Linux engine maps it (host-gateway) to the
	// default bridge's gateway — docker0, an address only containers are on.
	// HIO_TUNNEL_HOST overrides it (a host-gateway-ip set in the daemon's config,
	// a rootless engine).
	async hostAddress(): Promise<string> {
		const override = process.env["HIO_TUNNEL_HOST"];
		if (override) return override;
		if (process.platform !== "linux") return LOOPBACK;
		const info = await this.docker.info() as { OperatingSystem?: string };
		if (info.OperatingSystem?.includes("Docker Desktop")) return LOOPBACK;
		const bridge = await this.docker.getNetwork("bridge").inspect() as { IPAM?: { Config?: Array<{ Gateway?: string }> } };
		const gateway = bridge.IPAM?.Config?.find(config => config.Gateway && !config.Gateway.includes(":"))?.Gateway;
		if (!gateway) throw new Error("Couldn't find the Docker bridge's gateway — set HIO_TUNNEL_HOST to the address containers reach the host on.");
		return gateway;
	}

	private buildImageName(name: string, registry?: string): string {
		return registry ? `${registry}/${name}` : name;
	}

	private resolveNetworkMode(network: ContainerCreateOptions["network"]): string | undefined {
		if (!network) return undefined;
		switch (network.mode) {
			case "bridge":    return "bridge";
			case "host":      return "host";
			case "none":      return "none";
			case "container": return `container:${network.target}`;
			case "custom":    return network.networkName;
		}
	}
}

function buildSingleFileTar(filename: string, content: Buffer): Buffer {
	const header = Buffer.alloc(512, 0);

	header.write(filename, 0, 100, "ascii");
	header.write("0000644\0", 100, 8, "ascii");
	header.write("0000000\0", 108, 8, "ascii");
	header.write("0000000\0", 116, 8, "ascii");
	header.write(content.length.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
	header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0", 136, 12, "ascii");
	header.fill(0x20, 148, 156); // checksum placeholder = spaces
	header.write("0", 156, 1, "ascii");
	header.write("ustar\0", 257, 6, "ascii");
	header.write("00", 263, 2, "ascii");

	let checksum = 0;
	for (let i = 0; i < 512; i++) checksum += header[i]!;
	header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");

	const padded = Buffer.alloc(Math.ceil(content.length / 512) * 512);
	content.copy(padded);

	return Buffer.concat([header, padded, Buffer.alloc(1024)]);
}
