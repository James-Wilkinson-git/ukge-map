#!/usr/bin/env python3
"""
Download remote image URLs from public/mapdata.json into public/vendor/ukge-assets/
and rewrite the JSON to use local paths (/vendor/ukge-assets/…).
Safe to re-run (skips existing files with matching size stub).
"""

from __future__ import annotations

import concurrent.futures
import hashlib
import json
import pathlib
import sys
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parent.parent
MAPDATA = ROOT / "public" / "mapdata.json"
OUT_DIR = ROOT / "public" / "vendor" / "ukge-assets"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
REFERER = "https://www.ukgamesexpo.co.uk/"

def short_name(url: str) -> str:
    path = urlparse(url).path
    ext = pathlib.PurePosixPath(path).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".bmp"}:
        ext = ".bin"
    h = hashlib.sha256(url.encode("utf-8")).hexdigest()[:20]
    return f"{h}{ext}"


def collect_urls(data: dict) -> list[str]:
    found: set[str] = set()
    for m in data.get("maps") or []:
        for key in ("image", "flattened_image"):
            v = m.get(key)
            if isinstance(v, str) and v.startswith(("http://", "https://")):
                found.add(v)
    for ex in data.get("exhibitors") or []:
        v = ex.get("logo")
        if isinstance(v, str) and v.startswith(("http://", "https://")):
            found.add(v)
    return sorted(found)


def rewrite_urls(data: dict, mapping: dict[str, str]) -> dict:

    def walk(o):
        if isinstance(o, dict):
            return {k: walk(v) for k, v in o.items()}
        if isinstance(o, list):
            return [walk(i) for i in o]
        if isinstance(o, str) and o in mapping:
            return mapping[o]
        return o

    return walk(data)


def fetch(url: str, dest: pathlib.Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Referer": REFERER,
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = resp.read()
    dest.write_bytes(body)


def main() -> int:
    if not MAPDATA.is_file():
        print("Missing mapdata:", MAPDATA, file=sys.stderr)
        return 1

    with MAPDATA.open(encoding="utf-8") as fp:
        data = json.load(fp)

    urls = collect_urls(data)
    print(f"Found {len(urls)} unique remote image URLs")

    mapping: dict[str, str] = {}
    lock = threading.Lock()
    done = {"n": 0}

    def one(url: str) -> None:
        fname = short_name(url)
        dest = OUT_DIR / fname
        rel_public = f"/vendor/ukge-assets/{fname}"
        mapping[url] = rel_public

        if dest.is_file() and dest.stat().st_size > 0:
            with lock:
                done["n"] += 1
            return

        for attempt in range(6):
            try:
                fetch(url, dest)
                break
            except urllib.error.HTTPError as e:
                wait = 4 * (attempt + 1)
                if e.code in {403, 429, 503} and attempt < 5:
                    time.sleep(wait)
                    continue
                raise RuntimeError(f"{url}: {e}") from e
            except (urllib.error.URLError, OSError, TimeoutError) as e:
                wait = (attempt + 1) * 3
                if attempt < 5:
                    time.sleep(wait)
                    continue
                raise RuntimeError(f"{url}: {e}") from e

        with lock:
            done["n"] += 1
            if done["n"] % 40 == 0 or done["n"] == len(urls):
                print(f"  downloaded {done['n']}/{len(urls)}")

    # Conservative concurrency — media CDN sometimes returns 403 under burst traffic.
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        list(ex.map(one, urls))

    updated = rewrite_urls(data, mapping)
    with MAPDATA.open("w", encoding="utf-8") as fp:
        json.dump(updated, fp, ensure_ascii=False, indent=2)
        fp.write("\n")

    print(f"Updated {MAPDATA} with {len(mapping)} local paths")
    print(f"Assets in {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
