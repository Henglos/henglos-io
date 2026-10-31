import { BaseError } from "@/application/errors/BaseError";
import { TokenService } from "@/application/services/Token.service";
import { CanActivate, ExecutionContext, HttpException, Injectable } from "@nestjs/common";
import { Request } from "express";
import { Observable } from "rxjs";

/**
 * Lets a request through only with a valid user access token
 * (`Authorization: Bearer <token>`), and puts who it is on the request — for
 * @AuthUser() and @Token(). An expired token answers 401 (expired_token), so
 * the studio knows to refresh it.
 */
@Injectable()
export class AuthGuard implements CanActivate {

	constructor(
		private readonly tokenService: TokenService
	) {}

	canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
		
		const request = context.switchToHttp().getRequest<Request & { userId: string; token: string; email: string; }>();
		console.log('AuthGuard URL:', request.url, request.method);
		
		const authHeader = request.headers.authorization || "";
		const token = authHeader.replace("Bearer ", "");

		try {

			const authUser = this.tokenService.verify(token);

			request.userId = authUser.userId;
			request.email = authUser.email.getValue();
			request.token = token;

			return true;

		} catch (e) {

			if (e instanceof BaseError) throw new HttpException(e.toResponseString(), e.code);
			throw e;

		}

	}

}
