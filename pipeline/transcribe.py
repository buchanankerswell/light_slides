#!/usr/bin/env python3
"""Transcribe tutorial audio with faster-whisper -> JSON cues.

Reproducible but heavy: runs once per video, outputs committed cues JSON.
Requires: pip install faster-whisper (pulls a ~150MB model on first run).

Usage:
    python3 transcribe.py raw/Olivine*.mp4 assets/cues/olivine.json [--model small] [--fix terms.txt]
    python3 transcribe.py --fix-only cues/ [--fix terms.txt]  # re-bake fixes without re-transcribing

The optional fix list corrects systematic mineral mishearings in a
transparent, reviewable way (one `wrong -> right` per line), e.g.:
    lucite -> leucite
    lucide -> leucite
"""

import json
import re
import sys

FIXES = [
    ("lucite", "leucite"),
    ("lucide", "leucite"),
    ("lusite", "leucite"),
    ("elucite", "leucite"),
    ("cancrenite", "cancrinite"),
    ("chloratoid", "chloritoid"),
    ("clina pyrroxene", "clinopyroxene"),
    ("clintinite", "clintonite"),
    ("cilimanite", "sillimanite"),
    ("cordyarite", "cordierite"),
    ("cordyrite", "cordierite"),
    ("coming tonight", "cummingtonite"),
    ("horn blends", "hornblende"),
    ("hornblend", "hornblende"),
    ("cionite", "kyanite"),
    ("lossonite", "lawsonite"),
    ("mermicite", "myrmekite"),
    ("gapolite", "scapolite"),
    ("calcillicate", "calc-silicate"),
    ("soda light", "sodalite"),
    ("wallastonite", "wollastonite"),
    ("eohedral", "euhedral"),
    ("myer", "myrmekite"),
    ("plage", "plagioclase"),
    ("amphibal", "amphibole"),
    ("appetite", "apatite"),
    ("6120", "60/120"),
    ("61-20", "60/120"),
    ("61 20", "60/120"),
    ("90 90", "90/90"),
    ("n-section", "end section"),
    ("n-sections", "end sections"),
    ("andelucite", "andalusite"),
    ("andalusia", "andalusite"),
    ("biotide", "biotite"),
    ("biotides", "biotite"),
    ("bitite", "biotite"),
    ("glaucaphane", "glaucophane"),
    ("glycophane", "glaucophane"),
    ("orthoperexene", "orthopyroxene"),
    ("orthopyrroxene", "orthopyroxene"),
    ("orthopyrxine", "orthopyroxene"),
    ("pleacroic", "pleochroic"),
    ("pleocroic", "pleochroism"),
    ("pleocroism", "pleochroism"),
    ("storolite", "staurolite"),
    ("turmaline", "tourmaline"),
    ("yodurite", "yoderite"),
]


def load_fixes(path):
    pairs = list(FIXES)
    if path:
        for line in open(path):
            if "->" in line:
                a, b = (p.strip() for p in line.split("->", 1))
                pairs.append((a, b))
    return pairs


def apply_fixes(text, pairs):
    for wrong, right in pairs:
        text = re.sub(r"\b" + re.escape(wrong) + r"\b", right, text, flags=re.IGNORECASE)
    return text


def main():
    args = sys.argv[1:]
    fix_path = args[args.index("--fix") + 1] if "--fix" in args else None
    pairs = load_fixes(fix_path)
    if args[0] == "--fix-only":
        from pathlib import Path

        changed = 0
        for path in sorted(Path(args[1]).glob("*.json")):
            cues = json.loads(path.read_text())
            before = json.dumps(cues, sort_keys=True)
            for c in cues:
                c["text"] = apply_fixes(c["text"], pairs)
                for w in c.get("words", []):
                    w["text"] = apply_fixes(w["text"], pairs)
            if json.dumps(cues, sort_keys=True) != before:
                path.write_text(json.dumps(cues, indent=1))
                changed += 1
        print(f"--fix-only {args[1]}: {changed} files changed")
        return
    src, out = args[0], args[1]
    model_name = args[args.index("--model") + 1] if "--model" in args else "small"

    from faster_whisper import WhisperModel

    model = WhisperModel(model_name)
    segments, _ = model.transcribe(src, word_timestamps=True)
    cues = []
    for seg in segments:
        text = apply_fixes(seg.text.strip(), pairs)
        if text:
            words = [
                {"start": round(w.start, 2), "end": round(w.end, 2), "text": apply_fixes(w.word.strip(), pairs)}
                for w in (seg.words or [])
                if w.word.strip()
            ]
            cues.append({"start": round(seg.start, 2), "end": round(seg.end, 2), "text": text, "words": words})
    json.dump(cues, open(out, "w"), indent=1)
    print(f"{src} -> {out} ({len(cues)} cues, model={model_name})")


if __name__ == "__main__":
    main()
