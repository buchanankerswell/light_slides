#!/usr/bin/env python3
"""Build slides.json + posters from raw tutorial downloads.

Reads pipeline/groups.json (mineral -> class), expects:
  raw/<Title> [<id>].mp4          (from fetch_tutorials.sh)
  raw/<Title> [<id>].en.vtt       (auto-subs, fallback cues)
  cues/<id>.json                  (from transcribe.py; preferred)

Writes:
  docs/data/slides.json           (video URLs point at the media Release)
  docs/assets/posters/<id>.jpg

Usage:
    python3 build.py --raw raw --cues cues --release https://github.com/buchanankerswell/light_slides/releases/download/tutorial-videos-v1 --out docs
"""

import argparse
import json
import subprocess
from pathlib import Path

from sid import sid_for_stem, title_for_stem

# Quality-first: videos stream from a Release, so the repo stays small.
# Sources cap at 480x480 for this collection; keep native pixels, no downscale.
# crf 26 halves the crf-23 size on grainy stage footage with no visible
# loss in interference colors; the 8-minute tutorials stay streamable.
ENC = [
    "-c:v",
    "libx264",
    "-crf",
    "26",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ac",
    "1",
    "-b:a",
    "96k",
    "-movflags",
    "+faststart",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="raw")
    ap.add_argument("--cues", default="cues")
    ap.add_argument("--release", required=True)
    ap.add_argument("--out", default="docs")
    a = ap.parse_args()

    raw, out = Path(a.raw), Path(a.out)
    here = Path(__file__).parent
    groups = json.load(open(here / "groups.json"))
    minerals = {e["mineral"]: e for e in json.load(open(here / "minerals.json"))}
    mineral_group = {m: g for g, d in groups.items() for m in d["members"]}
    missing = set(mineral_group) - set(minerals)
    if missing:
        raise SystemExit(f"minerals.json lacks: {sorted(missing)}")

    slides = []
    for mp4 in sorted(raw.glob("*.mp4")):
        mineral, vid = title_for_stem(mp4.stem)
        if not vid:
            continue
        sid = sid_for_stem(mp4.stem)
        if mineral not in minerals:
            raise SystemExit(f"{mp4.name}: {mineral!r} not in minerals.json")
        entry = minerals[mineral]
        cue_src = Path(a.cues) / f"{sid}.json"
        cue_dst = out / "assets" / "cues" / f"{sid}.json"
        cue_dst.parent.mkdir(parents=True, exist_ok=True)
        if cue_src.exists():
            cue_dst.write_bytes(cue_src.read_bytes())
        encoded = out / "assets" / "vids" / f"{sid}.mp4"
        encoded.parent.mkdir(parents=True, exist_ok=True)
        if not encoded.exists():
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(mp4), *ENC, str(encoded)], check=True)
        slide = {
            "id": sid,
            "mineral": mineral,
            "symbol": entry["symbol"],
            "aliases": entry["aliases"],
            "features": entry["features"],
            "formula": entry.get("formula"),
            "occurrences": entry.get("occurrences"),
            "associated": entry.get("associated"),
            "economic": entry.get("economic"),
            "resources": entry.get("resources"),
            "distinguishing": entry.get("distinguishing"),
            "uses": entry.get("uses"),
            "minerals": entry.get("minerals"),
            "group": mineral_group.get(mineral, "concepts"),
            "video": f"{a.release}/{sid}.mp4",
            "poster": f"assets/posters/{sid}.jpg",
            "cues": f"assets/cues/{sid}.json",
            "yt": f"https://youtu.be/{vid}",
            "audio": True,
            "duration": 0,
        }
        # poster = first frame
        poster = out / slide["poster"]
        poster.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "0.5", "-i", str(mp4), "-frames:v", "1", "-q:v", "4", str(poster)], check=True)
        slides.append(slide)

    data = {
        "groups": [{"id": g, "label": d["label"], "slides": [s["id"] for s in slides if s["group"] == g]} for g, d in groups.items()],
        "slides": slides,
    }
    (out / "data").mkdir(parents=True, exist_ok=True)
    json.dump(data, open(out / "data" / "slides.json", "w"), indent=1)
    print(f"{len(slides)} slides -> {out}/data/slides.json")


if __name__ == "__main__":
    main()
