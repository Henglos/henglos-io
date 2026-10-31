"""
Packs the official MicroPython stubs — https://github.com/Josverl/micropython-stubs —
for the board's port and firmware into one JSON the code editor's Pyright
worker loads as-is (`initializationOptions.files`):

    { "/typings/machine.pyi": "<source>", "/typings/stdlib/VERSIONS": "…", … }

    python scripts/pack-micropython-stubs.py                       # defaults below
    python scripts/pack-micropython-stubs.py --stubs 1.29.0.post1 --port esp32

`/typings` is both Pyright's typeshedPath (stdlib/ comes from
micropython-stdlib-stubs, replacing CPython's) and its stubPath (the port's
modules: machine, network, esp32, …) — the layout the stubs are made for.
Nothing from the stubs is executed; pip only downloads them into a temp dir.

Bump --stubs together with `firmware.micropython` in
packages/packages/boards/Esp32/workspace/manifest.yaml.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "pyright"

# What Pyright reads: stubs, typeshed's VERSIONS table, partial-stub markers.
KEEP_SUFFIXES = {".pyi"}
KEEP_NAMES = {"VERSIONS", "py.typed"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", default="esp32")
    parser.add_argument("--stubs", default="1.29.0.post1", help="micropython-<port>-stubs version (matches the firmware)")
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix="mpy-stubs-") as tmp:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--quiet", "--no-user", "--no-deps", "--target", tmp,
             f"micropython-{args.port}-stubs=={args.stubs}", "micropython-stdlib-stubs"],
            check=True,
        )
        root = Path(tmp)

        files: dict[str, str] = {}
        for path in sorted(root.rglob("*")):
            rel = path.relative_to(root)
            if not path.is_file() or rel.parts[0].endswith(".dist-info") or rel.parts[0] == "bin":
                continue
            if path.suffix not in KEEP_SUFFIXES and path.name not in KEEP_NAMES:
                continue
            files["/typings/" + rel.as_posix()] = path.read_text(encoding="utf-8")

    version = args.stubs.split(".post")[0]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"micropython-{args.port}.json"
    out.write_text(json.dumps({
        "source": f"micropython-{args.port}-stubs=={args.stubs}",
        "port": args.port,
        "version": version,
        "files": files,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"{out.relative_to(ROOT)}: {len(files)} files, {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
