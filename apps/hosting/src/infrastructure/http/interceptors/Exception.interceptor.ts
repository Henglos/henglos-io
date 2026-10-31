import { BaseError } from "@/application/errors/BaseError";
import { InternalError } from "@/application/errors/Services.error";
import { CallHandler, ExecutionContext, HttpException, NestInterceptor } from "@nestjs/common";
import { catchError, Observable, throwError } from "rxjs";

/**
 * Turns what a route throws into its HTTP answer: a BaseError as its `code`
 * with `{ id, info }`; an HttpException as it is; anything else as a 500
 * internal_error — its details stay in the server's log. Global (main.ts).
 */
export class ExceptionInterceptor implements NestInterceptor {

	intercept(context: ExecutionContext, next: CallHandler<any>): Observable<any> | Promise<Observable<any>> {

		return next.handle().pipe(
			catchError((error) => {

				console.log(error)

				if (error instanceof HttpException) {

					return throwError(() => error);

				} else if (error instanceof BaseError) {

					return throwError(() =>
						new HttpException(error.toResponseString(), error.code)
					);

				} else {

					const internalError = new InternalError();

					return throwError(() =>
						new HttpException(internalError.toResponseString(), internalError.code)
					);

				}

			})
		);
		
	}

}
