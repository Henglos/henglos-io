import zod from "zod";

/** One of a board's pins: its GPIO number, and what it can do. */
export const PinSchema = zod.object({
	gpio: zod.number().int().nonnegative(),
	type: zod.array(
        zod.union([
            zod.literal("digital_in"),
            zod.literal("digital_out"),
            zod.literal("analog_in"),
            zod.literal("analog_out"),
            zod.literal("pwm"),
            zod.literal("touch"),
            zod.literal("i2c"),
            zod.literal("spi"),
            zod.literal("uart"),
        ])
    ),
	displayName: zod.string().optional(),
}).strict();

/** One of a board's pins: its GPIO number, and what it can do. */
export type IPinSchema = zod.infer<typeof PinSchema>;
