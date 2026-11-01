# Studio

`app`

The Henglos IO web app — where you build, run and debug your workflows.

## What it does

- Draw a workflow on a canvas: actions are blocks, wires connect them.
- Browse and install boards and components from the library.
- Send the workflow to a board and watch it run, step by step, with every value on screen.
- Edit together with others in real time.

## Where it fits

```txt
Studio (browser)  ⇄  Hosting  ⇄  Driver (your computer)  ⇄  Board (USB)
```

The studio is what you see in the browser. Everything it saves or sends to a board goes
through the [hosting](../../hosting).

## License

Part of Henglos IO, distributed under the [Sustainable Use License](LICENSE).
