# Changesets

The npm packages here are versioned and published with
[Changesets](https://github.com/changesets/changesets) — each one on its own
version, bumped only when it changes.

## Published packages

`@henglosio/cli`, `@henglosio/hio-system`, `@henglosio/ui`, `@henglosio/workflow`,
`@henglosio/workflow-ui`, and the boards and components under `packages/library`.

Everything else is `private` and never versioned here: the hosting and the
studio (released as Docker images, tagged `vX.Y.Z`), and the packages bundled
into the CLI — `@henglosio/driver`, `@henglosio/shared`, `@henglosio/runner`,
`@henglosio/rfc2217`. `hio-sdk` is Python: bump `packages/hio-sdk/pyproject.toml`
by hand and publish it with `uv publish`.

## Workflow

1. After a change worth releasing: `pnpm changeset` — pick the packages, the
   bump (patch / minor / major) and write one line for the changelog. Commit the
   file it writes here along with the change.
2. To release: `pnpm version-packages` — applies the pending changesets: bumps
   the versions, updates internal dependencies, writes each CHANGELOG.md.
   Review and commit.
3. `pnpm release` — publishes to npm what isn't there yet. It creates no git
   tags (`--no-git-tag`): the repo is tagged per release of the whole project
   (`v1.2.0-beta`), not per package — each package's version lives in its
   package.json and CHANGELOG.md.

**A change in a bundled package** (driver, shared, runner, rfc2217) ships inside
the CLI: name `@henglosio/cli` in its changeset — being private, they don't bump
anything on their own.
