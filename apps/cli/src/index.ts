#!/usr/bin/env node
/**
 * Entry point of `hio`, the Henglos IO command line.
 *
 * - `hio build` / `hio flash` — run the platform's build or flash for a
 *   workspace. The driver runs them inside a build container; they also work
 *   locally, on a workspace folder.
 * - `hio firmware` — try a board's firmware script in its image, without the
 *   studio.
 * - `hio create` / `hio lint` — write a new board or component from a
 *   template, and check a package before publishing it.
 * - `hio driver …` — run this machine as a driver (defined in
 *   `@henglosio/driver`).
 */

import "dotenv/config";
import { registerDriverCommands } from "@henglosio/driver/commands";
import cli from "./cli.js";
import { registerBuildCommand } from "./commands/build.command.js";
import { registerCreateCommand } from "./commands/create.command.js";
import { registerFirmwareCommand } from "./commands/firmware.command.js";
import { registerFlashCommand } from "./commands/flash.command.js";
import { registerLintCommand } from "./commands/lint.command.js";

cli.name("hio").description("Henglos IO — create, check, build and flash packages, and run this machine as a driver");

registerCreateCommand(cli);
registerLintCommand(cli);
registerBuildCommand(cli);
registerFlashCommand(cli);
registerFirmwareCommand(cli);
// Loaded on demand: `hio build` / `hio flash` (run inside build containers) never load the driver.
registerDriverCommands(cli);

await cli.parseAsync(process.argv);
