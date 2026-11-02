import { defineConfig } from "tsdown";

// Runs in Node (the hosting) and in the browser (the studio, workflow-ui), and
// imports nothing of either: neutral.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  platform: "neutral",
  fixedExtension: true,
});
