# hio-sdk

The SDK HenglosIO components are written with: the base classes and decorators
for actions and triggers (`from hio.sdk import HIOAction, action, ...`), plus
`hio.sdk.testing` to run an action under pytest without a board.

```sh
pip install hio-sdk
```

The same code runs on the board: every `@henglosio/hio-system` release ships
the sdk inside it, so a component never installs it on the device. This package
is for writing and testing components on your machine (types, autocomplete,
`hio.sdk.testing`).

## License

Part of Henglos IO, distributed under the [Sustainable Use License](LICENSE).
