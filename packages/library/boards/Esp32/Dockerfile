# henglosio/workbench-esp32 — where the ESP32 boards build and write their firmware
# (a board's firmware.image). What any such image must have: Node 24+, hio and
# Python 3 with pip, for the platform's Runner. The rest is the toolchain the
# board's firmware.ts drives — git, make and ESP-IDF's prerequisites to build,
# flock for its cache lock, esptool to write — with no board logic of its own.
#
#   docker build -f deploy/docker/images/workbench-esp32/Dockerfile -t henglosio/workbench-esp32 .
#
# MicroPython's source and ESP-IDF are fetched on the first build into
# /root/.cache/hio — a Docker volume the driver shares between the containers of
# this image — so the image only carries what ESP-IDF needs to install and build.

FROM node:24-bookworm-slim

# The hio that runs the platform's Runner and the board's script. HIO_NPM_REGISTRY
# is for trying an unpublished one, from the dev Gitea.
ARG HIO_CLI_VERSION=1.1.0
ARG HIO_NPM_REGISTRY=https://registry.npmjs.org/

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl build-essential \
        python3 python3-pip python3-venv \
        git wget flex bison gperf cmake ninja-build ccache \
        libffi-dev libssl-dev dfu-util libusb-1.0-0 util-linux \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g --registry "$HIO_NPM_REGISTRY" "@henglosio/cli@$HIO_CLI_VERSION"

RUN pip3 install --break-system-packages esptool

# Pre-warms the cache with the version today's boards use, so the first build
# doesn't need the network. Others install on first use.
RUN pip3 install --break-system-packages --target /root/.cache/hio/mpy-cross/1.29.0 "mpy-cross==1.29.0.*"

CMD ["bash"]
