# Serial (board-to-board)

A UART link between two HIO boards. Not the control link (the daemon connection) —
this drives the board's **free** UART (`board->serial(1)`, `UART_NUM_2` on the
Esp32 board, default pins TX=17 / RX=16).

## Actions

| Action | Configs | Output | Behaviour |
|---|---|---|---|
| **Begin** | `TX Pin`, `RX Pin`, `Baudrate` | `ready` (bool) | Opens `board->serial(1)` with the given pins/baud. Optional — Send/Receive configure the link themselves — but handy to bring it up once at the start. |
| **Send** | `TX Pin`, `RX Pin`, `Baudrate`, `Data` (`bytes`) | `sent` (uint16) | Wraps `Data` in one `PacketFrame` `DATA` frame (`STX/LEN/type/id/CRC16/ETX`) and writes it. |
| **Receive** | `TX Pin`, `RX Pin`, `Baudrate`, `Timeout` (ms) | `data` (uint8[]) | Accumulates bytes until a full `DATA` frame is decoded, or falls back on timeout (cap 30 s). |
| **End** | `TX Pin`, `RX Pin` | `closed` (bool) | Calls `board->serial(1)->end()` — releases the UART driver and pins. Pair with Begin to bracket a run of Send/Receive. |

`Data` is normally driven by a binding or a script from an earlier action.

## Wiring

```
Board A                 Board B
 TX (17) ───────────────► RX (16)
 RX (16) ◄─────────────── TX (17)
 GND ─────────────────── GND
```

`Baudrate` must match on both ends.

## Notes

- Framing (delimitation + CRC-16/MODBUS) is handled by
  `HIOSDK::Services::PacketFrame` — the same envelope the control link uses, so no
  second wire format. Payload only, no command layer.
- Payload is capped at `HIO_MAX_DATA_BUFFER` (64 bytes). Larger messages need
  chunking (not implemented yet).
- Send/Receive (and Begin) reconfigure the one shared `UART_NUM_2` on each
  `execute()` — last-config-wins. One board-to-board link at a time on the
  classic ESP32.
- A board whose `serial(1)` is `nullptr` makes every action take its fallback
  branch cleanly. On boards without a real `end()` override the SDK default is a
  no-op, so End still succeeds.
