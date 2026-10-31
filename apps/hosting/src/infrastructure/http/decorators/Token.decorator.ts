import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";

/** The request's bearer token, as the guard read it: `@Token() token: string`. */
export const Token = createParamDecorator((data: keyof any, context: ExecutionContext) => {

	const request = context.switchToHttp().getRequest<Request & { userId: string; token: string; }>();
	return request.token;

})
