# henglosio/workbench-rp2 — where Raspberry Pi's RP2040/RP2350 boards build
# and write their firmware: a board's firmware.image.
#
# What any workbench must have: Node 24+, for the runner host the driver copies
# in and runs (the image needs no `hio`). The rest is the toolchain the boards'
# firmware.ts drive — git, make, a host C compiler (mpy-cross, which the
# board's prepare builds), CMake and the Arm GNU toolchain for MicroPython's
# rp2 port, Python 3 for MicroPython's build scripts, flock for the cache lock
# — with no board logic of its own. The firmware is written by UF2, through the
# driver: no flashing tool here.
#
#   docker build -t henglosio/workbench-rp2:1.0.0 deploy/docker/images/workbench-rp2
#
# What's big and versioned is fetched by each board's prepare, on its first
# build, into /root/.cache/hio — a Docker volume the driver shares between the
# containers: MicroPython's source and the pico-sdk (its submodule). So one
# image serves every RP2 board, and a new MicroPython needs a new board
# version, not a new image.

FROM node:24-bookworm-slim

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends \
        ca-certificates git build-essential cmake python3 util-linux \
        gcc-arm-none-eabi libnewlib-arm-none-eabi libstdc++-arm-none-eabi-newlib \
    && rm -rf /var/lib/apt/lists/*

CMD ["bash"]
