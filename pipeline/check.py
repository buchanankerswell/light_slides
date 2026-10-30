#!/usr/bin/env python3
"""Validate the built viewer data: slides.json plus its referenced assets.

Usage: python3 check.py [site_dir]
Exits non-zero on structural errors. Missing local video files are a
warning, not a failure: videos are large, regenerable, or Release-hosted.
"""

import json
import sys
from pathlib import Path

REQUIRED = ("id", "mineral", "symbol", "aliases", "features", "formula", "occurrences", "associated", "economic", "resources", "distinguishing", "uses", "minerals", "group", "video", "poster", "cues", "yt")


def main():
    site = Path(sys.argv[1] if len(sys.argv) > 1 else "prototype")
    here = Path(__file__).parent
    data = json.loads((site / "data" / "slides.json").read_text())
    registry = {e["mineral"]: e for e in json.loads((here / "minerals.json").read_text())}
    groups = json.load(open(here / "groups.json"))
    errors, warnings = [], []
    ids = [s["id"] for s in data["slides"]]
    if len(ids) != len(set(ids)):
        errors.append("duplicate slide ids")
    grouped = {sid for g in data["groups"] for sid in g["slides"]}
    if set(ids) != grouped:
        errors.append(f"group coverage mismatch: {sorted(set(ids) ^ grouped)}")
    members = {m for g in groups.values() for m in g["members"]}
    if set(registry) != members:
        errors.append(f"minerals.json/groups.json mismatch: {sorted(set(registry) ^ members)}")
    for s in data["slides"]:
        entry = registry.get(s.get("mineral", ""))
        if entry is None:
            errors.append(f"{s.get('id', '?')}: mineral {s.get('mineral', '')!r} not in minerals.json")
        elif s.get("symbol") != entry["symbol"] or s.get("aliases") != entry["aliases"]:
            errors.append(f"{s['id']}: symbol/aliases disagree with minerals.json")
        feats = s.get("features")
        if not isinstance(feats, list) or any(not f or f != f.lower().strip() for f in feats):
            errors.append(f"{s['id']}: features must be a lowercase string list")
        elif entry["symbol"] and not feats:
            errors.append(f"{s['id']}: mineral with a symbol needs at least one feature")
    for name, entry in registry.items():
        if entry.get("economic") not in ("yes", "no", "maybe", None):
            errors.append(f"{name}: economic must be yes/no/maybe, got {entry.get('economic')!r}")
        res = entry.get("resources")
        if res is not None and (
            not isinstance(res, list) or any(set(r) != {"label", "url"} or not r["url"].startswith("http") for r in res)
        ):
            errors.append(f"{name}: resources must be a [{{label, url}}] list")
        for f in ("distinguishing", "uses", "occurrences", "formula"):
            if entry.get(f) is not None and not isinstance(entry.get(f), str):
                errors.append(f"{name}: {f} must be a string")
        members = entry.get("minerals")
        if members is not None and (not isinstance(members, list) or any(m not in registry for m in members)):
            errors.append(f"{name}: minerals must name known registry entries")
    for s in data["slides"]:
        for f in REQUIRED:
            if f not in s:
                errors.append(f"{s.get('id', '?')}: missing field {f}")
        for f in ("poster", "cues"):
            if s.get(f, "").startswith("http"):
                continue
            if not (site / s[f]).exists():
                errors.append(f"{s['id']}: missing {f} -> {s[f]}")
        if not s.get("cues", "").startswith("http"):
            try:
                cues = json.loads((site / s["cues"]).read_text())
            except (OSError, ValueError) as e:
                errors.append(f"{s['id']}: unreadable cues ({e})")
                continue
            if not cues:
                errors.append(f"{s['id']}: empty cues")
                continue
            for c in cues:
                ws = c.get("words")
                if not isinstance(ws, list) or not ws or any(set(w) != {"start", "end", "text"} or not w["text"] for w in ws):
                    errors.append(f"{s['id']}: cue words malformed")
                    break
                if any(not isinstance(w["start"], (int, float)) or w["start"] > w["end"] for w in ws):
                    errors.append(f"{s['id']}: word timings malformed")
                    break
                if any(a["start"] > b["start"] for a, b in zip(ws, ws[1:])):
                    errors.append(f"{s['id']}: word timings out of order")
                    break
        video = s.get("video", "")
        if not video.startswith("http") and not (site / video).exists():
            warnings.append(f"{s['id']}: video not present locally (ok if Release-hosted)")
    for w in warnings:
        print(f"warn: {w}")
    if errors:
        print("\n".join(f"error: {e}" for e in errors))
        return 1
    print(f"ok: {len(ids)} slides, {len(data['groups'])} groups")
    return 0


if __name__ == "__main__":
    sys.exit(main())
