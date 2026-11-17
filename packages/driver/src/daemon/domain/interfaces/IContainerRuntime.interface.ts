/** A container, by its id and name. */
export type Container = {
	id: string;
	name: string;
};

/** An image, and the registry credentials to pull it, when it's private. */
export type ImageConfig = {
	name: string;
	registry?: string;
	username?: string;
	password?: string;
}

// A host folder (`hostPath`) or a named volume (`volume` — created on first
// use, kept across containers) mounted at `containerPath`.
export type VolumeBind = {
	containerPath: string;
	readOnly?: boolean;
} & ({ hostPath: string; volume?: never } | { volume: string; hostPath?: never });

// Covers any host device exposed into the container, including USB devices
// (Docker/Podman expose USB as device files via --device)
export type DeviceBind = {
	hostPath: string;
	containerPath: string;
	/** Access permissions: r=read, w=write, m=mknod. Defaults to 'rwm'. */
	permissions?: string;
};

/** The network a container joins. */
export type NetworkConfig =
	| { mode: 'bridge' }
	| { mode: 'host' }
	| { mode: 'none' }
	| { mode: 'container'; target: string }
	| { mode: 'custom'; networkName: string };

/** A host port forwarded to a container's. */
export type PortBinding = {
	hostPort: number;
	containerPort: number;
	protocol?: 'tcp' | 'udp';
};

/** How ensureNetwork makes a network. */
export type NetworkCreateOptions = {
	internal?: boolean;
	driver?: string;
};

/** Everything a container is made with. */
export type ContainerCreateOptions = {
	name?: string;
	image: ImageConfig;
	cmd?: string[];
	env?: Record<string, string>;
	volumes?: VolumeBind[];
	devices?: DeviceBind[];
	network?: NetworkConfig;
	privileged?: boolean;
	ports?: PortBinding[];
	labels?: Record<string, string>;
	extraHosts?: string[];
};

/** How a command runs inside a container. */
export type ExecOptions = {
	workingDir?: string;
	env?: Record<string, string>;
	user?: string;
	onLog?: (data: string) => void;
	/** Aborts the exec — the runtime stops the container to kill the process tree. */
	signal?: AbortSignal;
};

/** How a command inside a container ended, and what it printed. */
export type ExecResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

/** What the driver needs of a container engine — Docker today (DockerRuntimeImpl). */
export abstract class IContainerRuntime {
	// Lifecycle
	abstract createContainer(options: ContainerCreateOptions): Promise<Container>;
	abstract startContainer(nameOrId: string): Promise<void>;
	abstract stopContainer(nameOrId: string): Promise<void>;
	abstract removeContainer(nameOrId: string): Promise<void>;

	// State
	abstract containerExists(nameOrId: string): Promise<boolean>;
	abstract getContainerLabel(nameOrId: string, label: string): Promise<string | null>;

	// Execution
	abstract execCommand(nameOrId: string, cmd: string[], options?: ExecOptions): Promise<ExecResult>;

	// File transfer
	abstract copyFromContainer(nameOrId: string, containerPath: string): Promise<Buffer>;
	abstract copyToContainer(nameOrId: string, containerPath: string, content: Buffer): Promise<void>;

	// Images
	abstract imageExists(image: string, options: {registry?: string, username?: string; password?: string}): Promise<boolean>;
	abstract pullImage(image: string, options: {registry?: string, username?: string; password?: string}, onProgress?: (msg: string) => void): Promise<void>;

	// Networks
	abstract ensureNetwork(name: string, options?: NetworkCreateOptions): Promise<void>;
	/**
	 * The host address the containers reach as `host.docker.internal` — what the
	 * driver's tunnels listen on, so nothing else on the network reaches them.
	 */
	abstract hostAddress(): Promise<string>;
}
