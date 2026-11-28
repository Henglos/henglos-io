# Changesets

The npm packages here are versioned and published with
[Changesets](https://github.com/changesets/changesets): each one on its own
minor and patch, bumped only when it changes, and **every one on the same
major** (the project's era, below).

## Published packages

`@henglosio/cli`, `@henglosio/hio-system`, `@henglosio/ui`, `@henglosio/workflow`,
`@henglosio/workflow-ui`, and the boards and components under `packages/library`.
`hio-sdk` is Python: bump `packages/hio-sdk/pyproject.toml` by hand and publish
it with `uv publish`. It's in the era too.

Everything else is `private` and never versioned here: the hosting and the
studio (released as Docker images, tagged with the project's `vX.Y.Z`, so they
carry the era through the tag), and the packages bundled into the CLI:
`@henglosio/driver`, `@henglosio/shared`, `@henglosio/runner`, `@henglosio/rfc2217`.

## The era: one major for everything

The major is shared. **Compatible means the same major**: a board or component
of major N runs with hio-system, the CLI, the driver, the hosting and the
studio of major N. Boards and components declare `dependences.platform: ^N.0.0`.
A package that needs something added in a later minor declares `^N.x.0`, which
stays inside the major.

**When it's a major:** when a package of major N, updated, can break against
another package of the same major N that wasn't updated. Some examples:

- a board schema the hosting of today can't read (a field renamed, removed or retyped);
- a driver ↔ board protocol change (packets, commands);
- an `henglosio.sdk` call that components use changing or going away;
- a manifest format the CLI or the hosting of today rejects.

A new optional field that older parts ignore, a new feature, a fix or a new
component isn't a break. Those are a minor or a patch, through changesets as usual.

Majors are rare. Gather the breaks that are pending into one.

**Opening the next era:** `pnpm major "what broke, in one line"`
(`--dry-run` first to see it). It puts every package on `N+1.0.0` together, with
a "Major Changes" entry in each CHANGELOG.md, along with hio-sdk, the `version` of
hio-system's manifest.yaml, every board's and component's `dependences.platform`,
and the range `hio create` writes. A major isn't a changeset, because a changeset
major adds one to each package's own major and keeps packages on different
majors. Apply pending changesets before it.

`pnpm check:majors` checks the project is on one era. `pnpm version-packages` and
`pnpm release` run it. It also checks that hio-system's manifest.yaml has the
version its package.json does. Update the manifest by hand after
`version-packages` when hio-system went up.

## Workflow

1. After a change worth releasing: `pnpm changeset`. Pick the packages and the
   bump (patch or minor, never major: see above), then write one line for the
   changelog. Commit the file it writes here along with the change.
2. To release: `pnpm version-packages` applies the pending changesets: it bumps
   the versions, updates internal dependencies, writes each CHANGELOG.md, and
   checks the era. Review and commit.
3. `pnpm release` publishes to npm what isn't there yet. It creates no git
   tags (`--no-git-tag`): the repo is tagged per release of the whole project
   (`v3.0.0`), not per package. Each package's version lives in its
   package.json and CHANGELOG.md.

**A change in a bundled package** (driver, shared, runner, rfc2217) ships inside
the CLI: name `@henglosio/cli` in its changeset. Being private, they don't bump
anything on their own.
