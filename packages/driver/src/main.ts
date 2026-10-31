#!/usr/bin/env node
import { Command } from "commander";
import { registerDriverCommands } from "./commands.js";

// Development entry (npm run start:dev -- driver start --mode run). Users run
// the same commands through the Henglos IO CLI: `hio driver …` (apps/cli).
const program = new Command().name("hio");
registerDriverCommands(program);

await program.parseAsync(process.argv);
