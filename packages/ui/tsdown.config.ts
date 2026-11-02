import { defineConfig } from "tsdown";

// The library npm consumers get: everything in one bundle, its dependencies
// left as imports. "use client": the components use hooks and Radix, and a
// bundle has a single module boundary for Next's server components to respect.
export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	dts: true,
	sourcemap: true,
	clean: true,
	platform: "neutral",
	fixedExtension: true,
	outputOptions: { banner: '"use client";' },
});
