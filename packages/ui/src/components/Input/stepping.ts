// Shared by Handler (mouse scrub) and Field (arrow keys) so both step the
// value the same way: step/min/max come from the <input> attributes, and
// Shift = 10× / Alt = 0.1× the step.

const attr = (input: HTMLInputElement, name: string) => {
	const raw = input.getAttribute(name);
	const parsed = raw === null || raw === "" ? NaN : parseFloat(raw);
	return Number.isFinite(parsed) ? parsed : undefined;
};

const decimalsOf = (n: number) => {
	const [, frac = ""] = String(n).split(".");
	return frac.length;
};

/** Empty reads as 0; anything that isn't a plain number (an expression, a binding label…) is undefined. */
export const readNumber = (input: HTMLInputElement) => {
	const raw = input.value.trim();
	const parsed = raw === "" ? 0 : Number(raw);
	return Number.isFinite(parsed) ? parsed : undefined;
};

/** How much a step is worth with the keys held: Shift 10×, Alt 0.1×, else 1×. */
export const stepMultiplier = (e: { shiftKey: boolean; altKey: boolean }) =>
	e.shiftKey ? 10 : e.altKey ? 0.1 : 1;

/** `from` moved by `steps` × step × multiplier, clamped to min/max and rounded to the step's precision. */
export const stepValue = (input: HTMLInputElement, from: number, steps: number, multiplier: number) => {
	const baseStep = attr(input, "step") ?? 1;
	const step = Number((baseStep * multiplier).toFixed(decimalsOf(baseStep) + 1));
	const decimals = Math.max(decimalsOf(baseStep), decimalsOf(step), decimalsOf(from));

	let next = from + steps * step;
	const min = attr(input, "min");
	const max = attr(input, "max");
	if (min !== undefined) next = Math.max(min, next);
	if (max !== undefined) next = Math.min(max, next);

	return Number(next.toFixed(decimals));
};

// React tracks the input's value internally; going through the native setter
// and dispatching "input" is what makes the field's onChange fire.
export const writeValue = (input: HTMLInputElement, value: number) => {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, String(value));
	input.dispatchEvent(new Event("input", { bubbles: true }));
};
