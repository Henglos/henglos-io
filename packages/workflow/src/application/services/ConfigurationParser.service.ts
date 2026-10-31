import { Parser as MathParser } from "expr-eval";
import type { IConfigurationSchema, IOptionEntrySchema, IPatternSchema } from "../../domain/entities/IConfiguration.schema.js";
import type { IPinSchema } from "../../domain/entities/IPin.schema.js";
import { GPIOPin, HexColor, RgbColor, RgbaColor } from "../../patterns/common.js";
import { checkPatterns, type PatternMatch } from "../../patterns/registry.js";

/** One way to read a config's text as a value: `resolve` answers the value and whether it fit. */
export type ParsePipe<T = unknown> = {

	type: string;
	resolve(value: string): [T, boolean];

};

const matchesAny = (value: string, patterns?: string[]): boolean =>
	!patterns || patterns.length === 0 || patterns.some(pattern => new RegExp(pattern).test(value));

const mathParser = new MathParser();

const evaluateMath = (expression: string): number | null => {

	try {

		const result = mathParser.evaluate(expression);
		return typeof result === "number" && Number.isFinite(result) ? result : null;

	} catch {

		return null;

	}

};

/**
 * Reads and checks what's typed in a config field, by its type (see pipesFor): numbers (math
 * expressions too), colors, options, pins, patterns… — what the studio validates as you type,
 * and what an EXECUTE encodes.
 */
export class ConfigurationParser {

	constructor() {}

	static parse<T = unknown>(value: string, pipes: ParsePipe<T>[]): [string, T | null, boolean] {

		for (const pipe of pipes) {

			const [result, status] = pipe.resolve(value);
			if (status) return [value, result, true];

		}

		return [value, null, false];

	}

	static pipesFor(base: IConfigurationSchema): ParsePipe[] {

		switch (base.type) {

			case "string": return [ConfigurationParser.stringPipe(base.patterns, base.patternMatch)];
			case "password": return [ConfigurationParser.passwordPipe(base.patterns, base.patternMatch)];
			case "number": return [ConfigurationParser.numberPipe(base.patterns, base.patternMatch)];
			case "toggle": return [ConfigurationParser.togglePipe()];
			case "color": return [ConfigurationParser.colorPipe(base.hasTransparency)];
			case "options": return [ConfigurationParser.optionsPipe(base.options)];
			case "pin": return [ConfigurationParser.pinPipe(base.filterBy)];
			// No text to parse: chosen from a widget (any, variable), or not a value at all (code, bytes).
			default: return [];

		}

	}

	/**
	 * Why `value` (the text the user typed) isn't accepted by `base`, or null
	 * when it is — the message the studio shows under the field and the one a
	 * compile error carries. Covers the manifest's `patterns` filters and, for
	 * "number", that it evaluates at all.
	 */
	static validate(base: IConfigurationSchema, value: string): string | null {

		switch (base.type) {

			case "string":
			case "password":
				return checkPatterns(value, base.patterns, base.patternMatch);

			case "number": {
				if (value.trim() === "") return null;
				const result = evaluateMath(value.trim());
				if (result === null) return "Not a number or expression.";
				return checkPatterns(String(result), base.patterns, base.patternMatch);
			}

			default:
				return null;

		}

	}

	static stringPipe(patterns?: IPatternSchema[], match?: PatternMatch): ParsePipe<string> {

		return {
			type: "string",
			resolve: (value) => [value, checkPatterns(value, patterns, match) === null],
		};

	}

	static passwordPipe(patterns?: IPatternSchema[], match?: PatternMatch): ParsePipe<string> {

		return {
			type: "password",
			resolve: (value) => [value, checkPatterns(value, patterns, match) === null],
		};

	}

	static numberPipe(patterns?: IPatternSchema[], match?: PatternMatch): ParsePipe<number> {

		return {
			type: "number",
			resolve: (value) => {

				const trimmed = value.trim();
				if (trimmed === "") return [NaN, false];

				const result = evaluateMath(trimmed);
				if (result === null) return [NaN, false];
				if (checkPatterns(String(result), patterns, match) !== null) return [NaN, false];

				return [result, true];

			},
		};

	}

	static togglePipe(): ParsePipe<boolean> {

		return {
			type: "toggle",
			resolve: (value) => {

				const normalized = value.trim().toLowerCase();
				if (["true", "1", "yes", "on"].includes(normalized)) return [true, true];
				if (["false", "0", "no", "off"].includes(normalized)) return [false, true];

				return [false, false];

			},
		};

	}

	static colorPipe(hasTransparency?: boolean): ParsePipe<string> {

		return {
			type: "color",
			resolve: (value) => {

				const patterns = hasTransparency ? [HexColor(), RgbColor(), RgbaColor()] : [HexColor(), RgbColor()];
				return [value, matchesAny(value, patterns)];

			},
		};

	}

	static optionsPipe(options: IOptionEntrySchema[]): ParsePipe<string> {

		// Values nested in a category count too.
		const values = options.flatMap(option => "categoryName" in option ? option.options : [option]).map(option => option.value);

		return {
			type: "options",
			resolve: (value) => [value, values.includes(value)],
		};

	}

	static pinPipe(filterBy?: IPinSchema["type"]): ParsePipe<{ gpio: number; type: IPinSchema["type"] }> {

		return {
			type: "pin",
			resolve: (value) => {

				const match = value.trim().match(/^\s*(\d+)\s*$/);
				const gpio = match?.[1];
				if (!gpio) return [{ gpio: NaN, type: [] }, false];

				if (!new RegExp(GPIOPin()).test(gpio)) return [{ gpio: NaN, type: [] }, false];

				return [{ gpio: Number(gpio), type: filterBy ?? [] }, true];

			},
		};

	}

}
