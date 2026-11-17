# ESP8266

`@henglosio/board-esp8266` — a Henglos IO board.

An ESP8266 module (ESP8266_GENERIC) — ESP-12E/F, NodeMCU, Wemos D1 mini or ESP-01S — ready to use with Henglos IO.

## What it brings

- Its pins, and what each one can do (digital, PWM), with the NodeMCU / Wemos labels — so the studio only offers the right pins.
- Wi-Fi — so components that need it, like WiFi and HTTP, can run on it.
- Its firmware: MicroPython, with the Henglos IO platform built in. Pick the module's flash size (2 MB and up, or 1 MB) in the workflow's board options.

## Good to know

- No analog input: the ESP8266's only ADC (A0) isn't read through a pin, the way the analog components do.
- GPIO0, GPIO2 and GPIO15 decide how the module boots — keep GPIO0 and GPIO2 high and GPIO15 low at reset.
- The first build fetches MicroPython and its xtensa-lx106 toolchain (x86-64 Linux), once.

## Getting it

Pick it when you create a workflow, or change to it from the workflow's settings.

## License

Part of Henglos IO, distributed under the [Sustainable Use License](LICENSE).
