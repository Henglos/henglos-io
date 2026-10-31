# Runner

`@henglosio/runner`

The builder that turns a workflow into something a board can run.

## What it does

- Gathers the workflow, its board and its components.
- Checks that everything fits together.
- Builds the result and hands it to the driver to write to the board.

## Where it fits

It runs inside a container started by the driver, so building never depends on what is installed on your computer.

## License

Part of Henglos IO, distributed under the [Sustainable Use License](LICENSE).
