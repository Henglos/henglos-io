---
"@henglosio/cli": minor
---

The board is the MicroPython port: its firmware script's `prepare` returns its mpy-cross, which builds the runtime and every component (sessions included, in the workflow's container — no more WASM mpy-cross); `build` is optional. New `hio firmware prepare [--force]`. The driver writes firmware through a flash broker — serial over RFC 2217, or a UF2 drive, with no serial port needed for a board in its bootloader — lists every volume of the machine, and asserts DTR on native USB boards (RP2040), whose long REPL answers arrived scrambled.
