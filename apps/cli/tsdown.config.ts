import { readFileSync } from "node:fs";
import { defineConfig } from "tsdown";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as { version: string };

export default defineConfig([
  {
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
  },
  {
    // The runner host the driver injects into the build container (see
    // src/runner-host.ts): one file with everything in it — the container has
    // Node, not this package's node_modules. Nothing native may reach it.
    entry: { "runner-host": "src/runner-host.ts" },
    format: ["esm"],
    dts: false,
    sourcemap: false,
    clean: false,
    platform: "node",
    shims: true,
    outExtensions: () => ({ js: ".mjs" }),
    define: { __HIO_VERSION__: JSON.stringify(version) },
    deps: {
      alwaysBundle: [/.*/],
    },
  },
]);
