#!/usr/bin/env python3
"""
1) Rename files in public/vendor/ by stripping Wagtail-style rendition suffixes
   (.width-123, .height-456, .format-webp, and junk between them and the real extension).

2) Patch public/mapdata.json so /vendor/ paths point at those shortened names when the
   file on disk matches the CDN pattern: slug.<hash fragments>.ext -> slug.ext
   Longer local stems are preferred first to avoid wrong matches.

Run again after dropping new downloads into public/vendor/.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
VENDOR = ROOT / "public" / "vendor"
MAPDATA = ROOT / "public" / "mapdata.json"

def strip_responsive_suffix(filename: str) -> str:
    """Remove .width-N... and .height-N... blocks before final extension."""
    name = filename
    prev = None
    while prev != name:
        prev = name
        name = re.sub(
            r"\.(?:width|height)-\d+.*?(?=\.[a-zA-Z0-9]+$)",
            "",
            name,
            flags=re.IGNORECASE,
        )
        name = re.sub(
            r"\.format-webp(?=\.[a-zA-Z0-9]+$)",
            "",
            name,
            flags=re.IGNORECASE,
        )
    return name


def rename_downloads() -> list[str]:
    """Strip .width- / .height- / .format-webp tails from filenames on disk."""
    if not VENDOR.is_dir():
        return []
    renames_log: list[str] = []
    for p in sorted((x for x in VENDOR.iterdir() if x.is_file()), key=lambda x: x.name):
        new_name = strip_responsive_suffix(p.name)
        if new_name == p.name:
            continue
        dest = VENDOR / new_name
        if dest.exists() and dest.resolve() != p.resolve():
            print(
                f"skip: {p.name} -> {new_name} (target exists)",
                file=sys.stderr,
            )
            continue
        old = p.name
        p.rename(dest)
        renames_log.append(f"{old} -> {new_name}")
    return renames_log


def vendor_basenames() -> list[str]:
    if not VENDOR.is_dir():
        return []
    return sorted(p.name for p in VENDOR.iterdir() if p.is_file())


def match_local_for_cdn_path(cdn_basename: str, locals_sorted: list[str]) -> str | None:
    """CDN slug.hex....ext → local slug.ext when that file exists."""
    if not pathlib.Path(cdn_basename).suffix:
        return None
    hits: list[str] = []
    if cdn_basename in locals_sorted:
        return cdn_basename
    cl = cdn_basename.lower()
    for local in locals_sorted:
        lstem = pathlib.Path(local).stem
        lsuffix = pathlib.Path(local).suffix.lower()
        if not cl.endswith(lsuffix):
            continue
        if cl.startswith(lstem.lower() + "."):
            hits.append(local)
    if not hits:
        return None
    # Prefer the longest slug when several locals could prefix-match (unlikely).
    return max(hits, key=lambda h: len(pathlib.Path(h).stem))


def patch_mapdata(files: list[str]) -> int:
    if not MAPDATA.is_file():
        return 0
    locals_sorted = sorted(files, key=lambda n: len(pathlib.Path(n).stem), reverse=True)

    with MAPDATA.open(encoding="utf-8") as fp:
        data = json.load(fp)

    n = 0

    def maybe_patch(val: str) -> str:
        nonlocal n
        if not isinstance(val, str) or not val.startswith("/vendor/"):
            return val
        base = val.rsplit("/", 1)[-1]
        if base in files:
            return val
        hit = match_local_for_cdn_path(base, locals_sorted)
        if hit and hit != base:
            n += 1
            return "/vendor/" + hit
        return val

    for m in data.get("maps") or []:
        if not isinstance(m, dict):
            continue
        for key in ("image", "flattened_image"):
            if key in m and isinstance(m[key], str):
                m[key] = maybe_patch(m[key])

    for ex in data.get("exhibitors") or []:
        if not isinstance(ex, dict):
            continue
        if isinstance(ex.get("logo"), str):
            ex["logo"] = maybe_patch(ex["logo"])

    MAPDATA.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return n


def main() -> int:
    if not VENDOR.is_dir():
        print("Create", VENDOR, "and add downloads first.", file=sys.stderr)
        return 1

    log = rename_downloads()
    for line in log[:30]:
        print(line)
    if len(log) > 30:
        print(f"... and {len(log) - 30} more renames")

    files = vendor_basenames()
    patched = patch_mapdata(files)
    print(f"mapdata.json: {patched} paths pointed at normalized /vendor/ files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
