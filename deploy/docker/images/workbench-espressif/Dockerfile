# henglosio/workbench-espressif — where Espressif's ESP32-family boards
# build and write their firmware: a board's firmware.image.
#
# What any workbench must have: Node 24+, for the runner host the driver copies
# in and runs (the image needs no `hio`), and Python 3 with pip, for the
# platform's build. The rest is the toolchain the boards' firmware.ts drive —
# git, make, a host C compiler and ESP-IDF's prerequisites to build, flock for
# the cache lock, esptool to write — with no board logic of its own.
#
#   docker build -t henglosio/workbench-espressif:1.0.0 deploy/docker/images/workbench-espressif
#
# What's big and versioned is fetched by each board's prepare, on its first
# build, into /root/.cache/hio — a Docker volume the driver shares between the
# containers: MicroPython's source and ESP-IDF. So one image serves every chip,
# and a new MicroPython or ESP-IDF needs a new board version, not a new image.

FROM node:24-bookworm-slim

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl wget git build-essential \
        python3 python3-pip python3-venv \
        flex bison gperf cmake ninja-build ccache \
        libffi-dev libssl-dev dfu-util libusb-1.0-0 util-linux \
    && rm -rf /var/lib/apt/lists/*

# The esptool the ESP32 boards flash with.
RUN pip3 install --break-system-packages esptool

# Pre-warms the cache with the mpy-cross today's boards use, so the platform's
# build doesn't need the network for it. Others install on first use.
RUN pip3 install --break-system-packages --target /root/.cache/hio/mpy-cross/1.29.0 "mpy-cross==1.29.0.*"

CMD ["bash"]
