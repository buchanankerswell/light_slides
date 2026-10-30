#!/usr/bin/env python3
"""Clean YouTube auto-sub VTT -> JSON cues [{start, end, text, words}].

Usage:
    python3 clean_captions.py in.en.vtt out.json
"""

import json
import re
import sys


def ts(s):
    h, mn, sec = s.split(":")
    return int(h) * 3600 + int(mn) * 60 + float(sec)


WORD_RE = re.compile(r"<(\d{2}:\d{2}:\d{2}\.\d{3})><c>(.*?)</c>")


def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s).strip()


def words_for(payload, start, end):
    """Recover per-word timings from auto-sub word tags.

    Text before the first tag belongs to words starting at the cue
    start; each tagged word starts at its tag and ends at the next
    word start (or the cue end for the last word).
    """
    chunks = WORD_RE.split(payload)
    items = []
    for w in strip_tags(chunks[0]).split():
        items.append((w, start))
    for i in range(1, len(chunks), 3):
        if i + 1 >= len(chunks):
            break
        for w in strip_tags(chunks[i + 1]).split():
            items.append((w, ts(chunks[i])))
    words = []
    for i, (w, s) in enumerate(items):
        e = items[i + 1][1] if i + 1 < len(items) else end
        words.append({"start": round(s, 2), "end": round(e, 2), "text": w})
    return words


def clean(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    cues = []

    def flush(state):
        start, end, payload = state
        if start is None or not payload:
            return
        joined = " ".join(payload)
        t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", joined)).strip()
        if t and (not cues or cues[-1]["text"] != t):
            cues.append({"start": round(start, 2), "end": round(end, 2), "text": t, "words": words_for(joined, start, end)})

    start, end, payload = None, None, []
    for line in text.splitlines():
        m = re.match(r"(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})", line)
        if m:
            flush((start, end, payload))
            start, end, payload = ts(m.group(1)), ts(m.group(2)), []
        elif not line.strip():
            flush((start, end, payload))
            payload = []
        elif "WEBVTT" not in line and "Kind:" not in line and "Language:" not in line:
            payload.append(line.strip())
    flush((start, end, payload))
    return cues


if __name__ == "__main__":
    cues = clean(sys.argv[1])
    json.dump(cues, open(sys.argv[2], "w"), indent=1)
    print(f"{sys.argv[1]} -> {sys.argv[2]} ({len(cues)} cues)")
