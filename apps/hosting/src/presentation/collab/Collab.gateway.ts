import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';

import { WorkflowCollabService } from '@/application/services/WorkflowCollab.service';

const COLLAB_PATH = '/io/collab';

const toUint8Array = (data: RawData) =>
	Array.isArray(data)
		? new Uint8Array(Buffer.concat(data))
		: new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));

// Hocuspocus expects a Fetch `Request`; build one from the upgrade request so
// hooks get real headers/query params.
const toRequest = (req: IncomingMessage) => {
	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value === undefined) continue;
		for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
	}
	return new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, { headers });
};

/**
 * Serves the Yjs sync protocol on /io/collab, on the same HTTP server as the
 * API — a plain WebSocket per open workflow, handed to Hocuspocus (see
 * WorkflowCollabService, which authenticates it). Socket.IO (/io/ws) also
 * listens to "upgrade" but only takes its own path, so the two coexist.
 */
@Injectable()
export class CollabGateway implements OnApplicationBootstrap, OnModuleDestroy {
	private readonly logger = new Logger(CollabGateway.name);
	private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });

	constructor(
		private readonly adapterHost: HttpAdapterHost,
		private readonly collab: WorkflowCollabService,
	) {}

	onApplicationBootstrap() {
		const server = this.adapterHost.httpAdapter.getHttpServer();
		server.on('upgrade', this.onUpgrade);
		this.wss.on('connection', this.onConnection);
	}

	onModuleDestroy() {
		this.adapterHost.httpAdapter.getHttpServer().off('upgrade', this.onUpgrade);
		this.wss.close();
	}

	private readonly onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
		const { pathname } = new URL(req.url ?? '/', 'http://localhost');
		if (pathname !== COLLAB_PATH) return;

		this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
	};

	private readonly onConnection = (ws: WebSocket, req: IncomingMessage) => {
		const connection = this.collab.hocuspocus.handleConnection(ws, toRequest(req));

		ws.on('message', (data) => connection.handleMessage(toUint8Array(data)));
		ws.on('close', (code, reason) => connection.handleClose({ code, reason: reason.toString() }));
		ws.on('error', (error) => this.logger.warn(`collab socket error: ${error.message}`));
	};
}
