import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["cjs"],
  dts: false,
  sourcemap: true,
  clean: true,
  platform: "node",
});
