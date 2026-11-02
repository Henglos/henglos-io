import { defineConfig } from "tsdown";

// The library npm consumers get — see packages/ui/tsdown.config.ts. React
// Flow's stylesheet stays an import, for the consumer's bundler to resolve.
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
