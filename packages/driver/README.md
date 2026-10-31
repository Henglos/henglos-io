# Driver

`@henglosio/driver`

The small program that runs on the computer your boards are plugged into.

## What it does

- Connects to the hosting and waits for commands.
- Finds the boards on your USB ports.
- Prepares what each workflow needs and writes it to the board.
- Relays the board's messages back, so the studio can show what's happening.

## Where it fits

```txt
Studio (browser)  ⇄  Hosting  ⇄  Driver (your computer)  ⇄  Board (USB)
```

You don't install it on its own — it comes with the [CLI](../../apps/cli) as `hio driver`.

## License

Part of Henglos IO, distributed under the [Sustainable Use License](LICENSE).
