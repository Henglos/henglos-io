import { defineConfig } from "tsdown";

export default defineConfig({
  // main: the development entry. commands: what the Henglos IO CLI
  // (apps/cli) bundles as `hio driver …`.
  entry: ["src/main.ts", "src/commands.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  platform: "node",
  tsconfig: "./tsconfig.json"
});
