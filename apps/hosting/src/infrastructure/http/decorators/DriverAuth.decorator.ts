
import { DriverAuth } from '@/domain/entities/DriverAuth';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/** The calling driver, in a route behind DriverAuthGuard: `@GetDriverAuth() driver: DriverAuth`. */
export const GetDriverAuth = createParamDecorator(
	(data: any, context: ExecutionContext) => {
		const request = context
			.switchToHttp()
			.getRequest<Request & {
				userId: string;
				driverId: string;
				deviceHWID: string;
				deviceUser: string;
				deviceName: string;
			}>();

		return new DriverAuth(request.driverId, request.userId, request.deviceHWID, request.deviceUser, request.deviceName);

	},
);
