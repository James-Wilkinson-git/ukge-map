#!/usr/bin/env python3
"""
Rewrite remote image URLs in public/mapdata.json to /vendor/<original-filename>.

Use after saving downloads into public/vendor/ with filenames matching the last
segment of the original URL (e.g. halltwo_2026_CHECKED.svg).

Does not alter exhibitor website fields or other outbound links.

Idempotent: leaves values that already start with /vendor/.
"""

from __future__ import annotations

import json
import pathlib
import sys
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parent.parent
MAPDATA = ROOT / "public" / "mapdata.json"


IMAGE_KEYS_MAPS = frozenset({"image", "flattened_image"})
IMAGE_KEYS_FLAT = frozenset({"logo"})


def to_vendor_path(url: str) -> str | None:
    if not url.startswith(("http://", "https://")):
        return None
    name = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    if not name:
        return None
    return f"/vendor/{name}"


def patch(data: dict) -> int:
    n = 0

    for m in data.get("maps") or []:
        if not isinstance(m, dict):
            continue
        for key in IMAGE_KEYS_MAPS:
            val = m.get(key)
            if not isinstance(val, str):
                continue
            if val.startswith("/vendor/"):
                continue
            local = to_vendor_path(val)
            if local:
                m[key] = local
                n += 1

    for ex in data.get("exhibitors") or []:
        if not isinstance(ex, dict):
            continue
        for key in IMAGE_KEYS_FLAT:
            val = ex.get(key)
            if not isinstance(val, str):
                continue
            if val.startswith("/vendor/"):
                continue
            local = to_vendor_path(val)
            if local:
                ex[key] = local
                n += 1

    return n


def main() -> int:
    if not MAPDATA.is_file():
        print("Missing", MAPDATA, file=sys.stderr)
        return 1

    text = MAPDATA.read_text(encoding="utf-8")
    data = json.loads(text)

    count = patch(data)
    MAPDATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Patched {count} image/logo fields to /vendor/<filename>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
