# @henglosio/board-esp32

## 3.0.0

### Major Changes

- Every HenglosIO package now shares its major: compatible means the same major. Boards and components depend on platform ^3.0.0.

## 1.3.0

### Minor Changes

- 62fd885: `prepare` builds and returns the checkout's mpy-cross. Depends on platform `^2.0.0`.

## 1.2.1

### Patch Changes

- The firmware builds in the port's default folder (ports/esp32/build-ESP32_GENERIC) instead of passing BUILD= to make: the variable reached the `make -C mpy-cross` that the port's CMake runs, which then compiled mpy-cross against the ESP32's qstr headers and failed with "unsigned conversion from 'int' to 'unsigned char'" (-Werror=overflow).

## 1.2.0

### Minor Changes

- Builds in henglosio/workbench-espressif, the image for every Espressif chip, which carries no `hio`.

## 1.1.0

### Minor Changes

- Boards can set up their firmware environment in a `prepare` of their own: the platform runs it before build and flash, under the cache lock, once per firmware script, MicroPython version and `scope: prepare` options, and the studio shows it as its own phase. Board options declare a `scope` (prepare, build or runtime): runtime options go to the board with the session (`henglosio.sdk.board_option`), with no build. The ESP32 board fetches MicroPython and ESP-IDF in `prepare` and needs platform ^1.4.0.
