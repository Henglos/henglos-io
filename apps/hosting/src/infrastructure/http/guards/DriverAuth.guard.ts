
import { DriverAuthService } from "@/application/services/DriverAuth.service";
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { Observable } from "rxjs";

/**
 * Lets a request through only with a valid driver access token
 * (`Authorization: Bearer <token>`), and puts which driver it is on the
 * request — for @GetDriverAuth().
 */
@Injectable()
export class DriverAuthGuard implements CanActivate {

	constructor(
		private readonly driverAuthService: DriverAuthService
	) {}

	canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {

		const request = context.switchToHttp().getRequest<Request & {
			userId: string;
			driverId: string;
			deviceHWID: string;
			deviceUser: string;
			deviceName: string;
			token: string;
		}>();

		const authHeader = request.headers.authorization || "";
		const token = authHeader.replace("Bearer ", "");

		const authDriver = this.driverAuthService.verify(token);

		request.userId = authDriver.userId;
		request.driverId = authDriver.id;
		request.deviceHWID = authDriver.deviceHWID;
		request.deviceUser = authDriver.deviceUser;
		request.deviceName = authDriver.deviceName;
		request.token = token;

		return true;

	}

}
