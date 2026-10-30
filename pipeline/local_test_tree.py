#!/usr/bin/env python3
"""Build a publish-faithful local test tree (stdlib only).

Copies docs/ to a temp dir and rewrites only the `video` field of
data/slides.json from Release URLs to relative local encodes, so the
viewer exercises the real posters, cues, CSS, JS, and mp4 bytes. Every
other file is byte-identical to what `make build` produced.

Usage:
    python3 pipeline/local_test_tree.py --site docs --out /tmp/ls-local-test
"""

import argparse
import json
import shutil
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default="docs")
    ap.add_argument("--out", default="/tmp/ls-local-test")
    a = ap.parse_args()
    site, out = Path(a.site), Path(a.out)
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(site, out, ignore=shutil.ignore_patterns("assets/vids"))
    (out / "assets" / "vids").mkdir(parents=True, exist_ok=True)
    missing = []
    for mp4 in sorted((site / "assets" / "vids").glob("*.mp4")):
        shutil.copy2(mp4, out / "assets" / "vids" / mp4.name)
    manifest_path = out / "data" / "slides.json"
    manifest = json.loads(manifest_path.read_text())
    for s in manifest["slides"]:
        local = out / "assets" / "vids" / f"{s['id']}.mp4"
        if not local.exists():
            missing.append(s["id"])
        s["video"] = f"assets/vids/{s['id']}.mp4"
    manifest_path.write_text(json.dumps(manifest, indent=1))
    print(f"test tree: {out} ({len(manifest['slides'])} slides, {len(manifest['groups'])} groups)")
    if missing:
        print(f"WARN: {len(missing)} videos missing locally: {missing[:5]}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
