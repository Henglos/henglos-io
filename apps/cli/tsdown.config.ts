import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  platform: "node",
  shims: true,
  deps: {
    // The workspace's packages (unpublished) go in the bundle; npm packages
    // stay `dependencies` — the driver's include native ones (serialport,
    // dockerode) that can't be bundled.
    alwaysBundle: [/^@henglosio\//],
  },
});
