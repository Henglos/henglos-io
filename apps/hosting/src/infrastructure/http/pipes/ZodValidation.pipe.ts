import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { z } from "zod";

/**
 * Validates a route's input against a zod schema: `@Body(new ZodValidationPipe(Schema))`.
 * Invalid input answers 400 with zod's issues; valid input arrives parsed.
 */
@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform {
	constructor(private readonly schema: T) {}

	transform(value: unknown): z.infer<T> {
		const result = this.schema.safeParse(value);
		if (!result.success) {
			throw new BadRequestException(result.error.issues);
		}
		return result.data;
	}
}
