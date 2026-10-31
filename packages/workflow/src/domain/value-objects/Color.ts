import { colord } from "colord";

/** An RGBA color — what a color config encodes on the wire. */
export class Color {

	R: number;
	G: number;
	B: number;
	A: number;

	constructor(r: number, g: number, b: number, a?: number) {

		this.R = r;
		this.G = g;
		this.B = b;
		this.A = a ?? 255;

	}

	toHex(): string {

		return colord(`rgba(${this.R}, ${this.G}, ${this.B}, ${this.A / 255})`).toHex();
		
	}

	static fromHex(hex: string): Color {
		
		const rgb = colord(hex).toRgb();
		return new Color(rgb.r, rgb.g, rgb.b, rgb.a);

	}


}
