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
