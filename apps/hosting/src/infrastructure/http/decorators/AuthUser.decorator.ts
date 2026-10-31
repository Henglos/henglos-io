import { MinimalUser } from '@/domain/entities/AuthUser';
import { Email } from '@/domain/value-object/Email';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/** The signed-in user, in a route behind AuthGuard: `@AuthUser() user: MinimalUser`. */
export const AuthUser = createParamDecorator(
	(data: any, context: ExecutionContext) => {
		const request = context
			.switchToHttp()
			.getRequest<Request & { userId: string; token: string; email: string; }>();

		return new MinimalUser(request.userId, Email.create(request.email));	

	},
);
