# The platform's container (manifest.yaml's build.image): runs its Runner
# (runner/build.js) through `hio build` / `hio flash`. Generic for every
# MicroPython board — mpy-cross is installed per firmware version on demand
# (the board says which), firmware images are downloaded from the board's
# firmware.image.
#
# A board with firmware.build gets its MicroPython built here, with the
# runtime frozen in: MicroPython's source and ESP-IDF are fetched on the first
# build into /root/.cache/hio — a Docker volume the driver shares between
# every workflow's container — so the image only carries what ESP-IDF needs
# to install and build.
FROM ghcr.io/henglos/base-io-workbench:latest

RUN apt-get update -y \
    && apt-get install -y \
        python3 python3-pip python3-venv \
        git wget flex bison gperf cmake ninja-build ccache \
        libffi-dev libssl-dev dfu-util libusb-1.0-0 util-linux \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages esptool

# Pre-warms the cache with the version today's boards use, so the first build
# doesn't need the network. Others install on first use.
RUN pip3 install --break-system-packages --target /root/.cache/hio/mpy-cross/1.29.0 "mpy-cross==1.29.0.*"

CMD [ "bash" ]
