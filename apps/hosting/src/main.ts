/**
 * The hosting's entry point: loads .env, starts the Nest application and
 * listens on HIO_HOST:HIO_PORT.
 *
 * - The API is under /io/api, versioned in the URI (v1 by default): /io/api/v1/…
 * - The sockets: /io/ws (Socket.IO — the studio's /app, the drivers' /driver)
 *   and /io/collab (the collaborative editing), on the same server.
 */
import { config } from 'dotenv';
config();

import { NestFactory } from '@nestjs/core';
import { MainModule } from './Main.module';
import { VersioningType } from '@nestjs/common';
import { ExceptionInterceptor } from './infrastructure/http/interceptors/Exception.interceptor';
import { ConfigService } from '@nestjs/config';
import { Env } from './config/env.schema';

const bootstrap = async () => {
	const app = await NestFactory.create(MainModule);

	const config = app.get(ConfigService<Env, true>);

	app.useGlobalInterceptors(new ExceptionInterceptor());

	// The API answers with what's true now (a board's status, a task's): never
	// cached, never revalidated — an ETag let the browser get a 304, which the
	// studio's requests see as a failure.
	app.getHttpAdapter().getInstance().set('etag', false);

	// Behind a proxy (Caddy), every request comes from the proxy's address:
	// trusting its X-Forwarded-For makes req.ip the client's — what the rate
	// limit counts per. Only as many hops as HIO_TRUST_PROXY says, so a client
	// can't pick its own address by sending the header.
	const trustProxy = config.get('HIO_TRUST_PROXY', { infer: true });
	if (trustProxy > 0) app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
	app.use('/io/api', (_req: unknown, res: { setHeader: (name: string, value: string) => void }, next: () => void) => {
		res.setHeader('Cache-Control', 'no-store');
		next();
	});

	app.setGlobalPrefix('/io/api');
	app.enableVersioning({
		type: VersioningType.URI,
		defaultVersion: '1',
	});

	// `*` lets any origin in (with credentials); otherwise only the ones listed.
	const corsOrigin = config.get('HIO_CORS_ORIGIN', { infer: true });

	app.enableCors({
		origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((o) => o.trim()),
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
		credentials: true,
	});

	await app.listen(
		config.get('HIO_PORT', { infer: true }),
		config.get('HIO_HOST', { infer: true }),
	);
};

bootstrap();
