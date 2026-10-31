import { Command } from "commander";

/**
 * The `hio` program — the single Commander instance every command registers on.
 *
 * Kept in its own module so the commands (`build`, `flash`, and the driver's
 * `driver …`) can be registered from anywhere without importing the entry
 * point, which parses `process.argv` as soon as it loads.
 */
const cli = new Command();

export default cli;
