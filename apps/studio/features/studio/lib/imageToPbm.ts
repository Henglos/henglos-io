// An image the user picked, as the 1-bit PBM a `type: file` config with
// `image: { format: "pbm" }` stores — what a monochrome display draws as is.
//
// PBM P4: "P4\n<width> <height>\n", then rows of ceil(width / 8) bytes, the
// leftmost pixel in the top bit — MONO_HLSB, the bitmap layout the board's
// framebuf draws. A set bit is a lit pixel.

export type Pbm = { width: number; height: number; rows: Uint8Array };

/** Lit pixels: the image's minority tone — a dark logo on white lights the logo; a light one on black, too. */
const THRESHOLD = 128;

export async function imageToPbm(file: Blob, maxWidth: number, maxHeight: number): Promise<{ pbm: Pbm; bytes: Uint8Array }> {

	const image = await createImageBitmap(file);
	// Fit inside the screen, keeping the proportions — never enlarged.
	const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
	const width = Math.max(1, Math.round(image.width * scale));
	const height = Math.max(1, Math.round(image.height * scale));

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d")!;
	context.drawImage(image, 0, 0, width, height);
	image.close();
	const { data } = context.getImageData(0, 0, width, height);

	// Luminance of each pixel — transparent ones are background (null).
	const luminance: (number | null)[] = [];
	let sum = 0, counted = 0;
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3]! < 128) {
			luminance.push(null);
			continue;
		}
		const value = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
		luminance.push(value);
		sum += value;
		counted++;
	}
	const lightImage = counted === 0 || sum / counted >= THRESHOLD;

	const rowBytes = Math.ceil(width / 8);
	const rows = new Uint8Array(rowBytes * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const value = luminance[y * width + x];
			if (value === null || value === undefined) continue;
			const lit = lightImage ? value < THRESHOLD : value >= THRESHOLD;
			if (lit) rows[y * rowBytes + (x >> 3)]! |= 0x80 >> (x & 7);
		}
	}

	const pbm = { width, height, rows };
	return { pbm, bytes: encodePbm(pbm) };

}

export function encodePbm({ width, height, rows }: Pbm): Uint8Array {
	const header = new TextEncoder().encode(`P4\n${width} ${height}\n`);
	const out = new Uint8Array(header.length + rows.length);
	out.set(header);
	out.set(rows, header.length);
	return out;
}

/** A P4 PBM's size and rows — null when it isn't one. */
export function decodePbm(bytes: Uint8Array): Pbm | null {
	// Header: "P4", whitespace, width, whitespace, height, one whitespace — comments (#) skipped.
	const text = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 128)));
	const match = /^P4(?:\s+(?:#[^\n]*\n\s*)*)(\d+)\s+(?:#[^\n]*\n\s*)*(\d+)\s/.exec(text);
	if (!match) return null;
	const width = Number(match[1]), height = Number(match[2]);
	const start = match[0].length;
	const rows = bytes.subarray(start, start + Math.ceil(width / 8) * height);
	return rows.length === Math.ceil(width / 8) * height ? { width, height, rows } : null;
}

/** The PBM drawn on `canvas`, `scale` px a pixel — lit in `on`, the rest in `off`. */
export function drawPbm(canvas: HTMLCanvasElement, { width, height, rows }: Pbm, scale: number, on: string, off: string): void {
	canvas.width = width * scale;
	canvas.height = height * scale;
	const context = canvas.getContext("2d")!;
	context.fillStyle = off;
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.fillStyle = on;
	const rowBytes = Math.ceil(width / 8);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (rows[y * rowBytes + (x >> 3)]! & (0x80 >> (x & 7))) context.fillRect(x * scale, y * scale, scale, scale);
		}
	}
}
