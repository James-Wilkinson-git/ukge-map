#!/usr/bin/env python3
"""
Assign exhibitor logos to files under public/vendor/ without hotlink guesses.

Resolution order per exhibitor (logo must be string under /vendor/):
  1) File already exists → keep path.
  2) CDN-style basename starts with donor_stem + "." and same extension → use donor file.
  3) Fuzzy similarity between donor stem and CDN human slug ≥ threshold → use donor file.
If no donor matches, leave the original /vendor/… path (add that exact filename later).

Title / website hints are deliberately NOT used (they caused bogus matches).
"""

from __future__ import annotations

import json
import pathlib
import re
import string
import sys
from difflib import SequenceMatcher

ROOT = pathlib.Path(__file__).resolve().parent.parent
VENDOR = ROOT / "public" / "vendor"
MAPDATA = ROOT / "public" / "mapdata.json"

IMG_SUFFIX = frozenset(
    ".png,.jpg,.jpeg,.gif,.webp,.avif,.svg,.bmp".split(","),
)
SLUG_FUZZY_MIN = 0.575
TOKEN_BOOST_STOP = frozenset(
    "games game logo ltd inc plc black white tabletop studio studios media group "
    "the and for png jpg jpeg webp gradient light background".split()
)


def norm(s: str) -> str:
    s = s.replace("_", " ").replace("-", " ")
    out = "".join(c.lower() if c.isalnum() else " " for c in s)
    return " ".join(out.split())


def similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def is_hashish_segment(seg: str) -> bool:
    if len(seg) < 14:
        return False
    hexd = sum(1 for c in seg.lower() if c in string.hexdigits)
    return hexd / len(seg) > 0.62


def cdn_human_slug(stem: str) -> str:
    parts = stem.split(".")
    while parts and is_hashish_segment(parts[-1]):
        parts.pop()
    return ".".join(parts)


def is_useless_donor(stem: str) -> bool:
    """Bare opaque ids aren't useful as fuzzy donors."""
    if len(stem) < 6:
        return True
    alnum = sum(1 for c in stem if c.isalnum())
    if len(stem) >= 20 and alnum == len(stem):
        hexish = sum(1 for c in stem.lower() if c in string.hexdigits)
        if hexish / len(stem) > 0.8:
            return True
        dig = sum(1 for c in stem if c.isdigit())
        if dig / len(stem) > 0.3:
            return True
    return False


def donor_list() -> list[pathlib.Path]:
    out = []
    for p in sorted(VENDOR.iterdir(), key=lambda x: x.name):
        if not p.is_file():
            continue
        if p.suffix.lower() not in IMG_SUFFIX:
            continue
        if is_useless_donor(p.stem):
            continue
        out.append(p)
    return out


def prefix_slug_match(donors: list[pathlib.Path], cdn_basename: str) -> str | None:
    """CDN Slug.Hex… .ext matched by donor Slug.ext (same slug prefix)."""
    suf = pathlib.Path(cdn_basename).suffix.lower()

    longest: tuple[int, pathlib.Path] | None = None
    for p in donors:
        plstem = p.stem.lower()
        if p.suffix.lower() != suf:
            continue
        if cdn_basename.lower().startswith(plstem + "."):
            cand_len = len(p.stem)
            if longest is None or cand_len > longest[0]:
                longest = (cand_len, p)

    # Also compare full CDN stem prefix (before fingerprints) vs donor stem
    full_stem = pathlib.Path(cdn_basename).stem
    slug = cdn_human_slug(full_stem)
    slug_low = slug.lower()
    longest2 = None
    for p in donors:
        pst = p.stem.lower()
        if p.suffix.lower() != suf:
            continue
        if slug_low.startswith(pst + ".") or slug_low == pst:
            cand_len = len(p.stem)
            if longest2 is None or cand_len > longest2[0]:
                longest2 = (cand_len, p)

    pick = longest or longest2
    return pick[1].name if pick else None


def chunky_tokens(stem: str) -> frozenset[str]:
    bits = set()
    parts = re.split(r"[._\-]+", stem.replace(" ", ""))
    for p in parts:
        pl = p.lower()
        if len(pl) < 3:
            continue
        if pl in TOKEN_BOOST_STOP:
            continue
        bits.add(pl)
        if len(pl) >= 4:
            bits.add(pl[:4])
    return frozenset(bits)


def fuzzy_best(donors: list[pathlib.Path], cdn_basename: str) -> str | None:
    slug = cdn_human_slug(pathlib.Path(cdn_basename).stem)
    sn = norm(slug)
    if len(sn) < 5:
        return None
    slug_toks = chunky_tokens(slug)
    slug_lower = slug.lower()
    best: tuple[float, pathlib.Path] | None = None
    for p in donors:
        ds = p.stem
        dn = norm(ds)
        if len(dn) < 5:
            continue
        sc = similarity(sn, dn)
        if sn in dn or dn in sn:
            sc = max(sc, min(1.0, max(len(sn), len(dn)) / max(len(sn) + len(dn), 1) + 0.25))

        donor_toks = chunky_tokens(ds)
        strong = slug_toks & donor_toks
        if len(strong) >= 2:
            sc = max(sc, 0.66)
        elif len(strong) == 1:
            lone = next(iter(strong))
            if len(lone) >= 5:
                sc = max(sc, 0.62)

        for tok in re.findall(r"[A-Za-z0-9]{6,}", ds):
            tl = tok.lower()
            if tl in TOKEN_BOOST_STOP:
                continue
            if tl in slug_lower:
                sc = max(sc, 0.62)
                break
        if sc < SLUG_FUZZY_MIN:
            continue
        if best is None or sc > best[0]:
            best = (sc, p)
    return best[1].name if best else None


def resolve_logo(path_in_json: str, donors: list[pathlib.Path]) -> str | None:
    name = path_in_json.split("/", 2)[2]
    disk = VENDOR / name
    if disk.is_file():
        return path_in_json

    pref = prefix_slug_match(donors, name)
    if pref:
        return "/vendor/" + pref

    fz = fuzzy_best(donors, name)
    if fz:
        return "/vendor/" + fz

    return None


def main() -> int:
    if not VENDOR.is_dir() or not MAPDATA.is_file():
        print("Need public/vendor and public/mapdata.json", file=sys.stderr)
        return 1

    donors = donor_list()
    if not donors:
        print(f"No usable donor images in {VENDOR}", file=sys.stderr)
        return 1

    print(f"{len(donors)} donor files (after opaque-id filter)")
    data = json.loads(MAPDATA.read_text(encoding="utf-8"))
    kept = 0
    remapped = 0
    left_unresolved_path = 0

    for ex in data.get("exhibitors") or []:
        if not isinstance(ex, dict):
            continue
        logo = ex.get("logo")
        if logo is None or logo is False:
            continue
        if not isinstance(logo, str) or not logo.startswith("/vendor/"):
            continue

        resolved = resolve_logo(logo, donors)
        if resolved is None:
            left_unresolved_path += 1
            continue
        if resolved == logo:
            kept += 1
        else:
            ex["logo"] = resolved
            remapped += 1

    MAPDATA.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Logo kept as-is on disk match: {kept}")
    print(f"Logo remapped to donor file:   {remapped}")
    print(f"Logo left as original path:   {left_unresolved_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
