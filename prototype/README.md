# Prototype (branch `agent/redesign-exploration` only — not for `main`)

Minimal darkroom viewer: one `<video>` element, range-slider scrub, synced captions.

## Make targets

```sh
make help   # full pipeline: fetch → cues → build → release-media
make run    # serve the viewer locally
make test   # validate slides.json and assets
make format # ruff + prettier at 150 cols
```

## Run locally (without conda)

```sh
cd prototype
# regenerate the 2 demo videos (gitignored) + subs:
yt-dlp --no-playlist -f "bv*[height<=480]+ba/b[height<=480]/b" \
  --merge-output-format mp4 --write-auto-subs --sub-langs en --sub-format vtt \
  -o "assets/vids/%(title)s.%(ext)s" \
  "https://youtu.be/UA43kJX0Czw" "https://youtu.be/trAGVNlg1Bo"
mv assets/vids/*.mp4 assets/vids/leucite.mp4 assets/vids/olivine.mp4  # rename to match data/slides.json
python3 -m http.server 8811
# open http://localhost:8811/
```

`data/slides.json` points at `assets/vids/*.mp4`, `assets/posters/*.jpg`, `assets/cues/*.json`.
Full reproducible workflow (54 tutorials) lives in `../pipeline/`.

## Data interface (pipeline → viewer seam)

`slides.json` is the only contract the viewer needs:

```jsonc
{
  "groups": [{ "id": "framework", "label": "Framework silicates", "slides": ["leucite"] }],
  "slides": [{
    "id": "leucite", "mineral": "Leucite", "symbol": "Lct", "aliases": ["lct", "leuc"], "group": "framework",
    "video": "assets/vids/leucite.mp4",   // local path or Release URL
    "poster": "assets/posters/leucite.jpg",
    "cues": "assets/cues/leucite.json",   // [{start, end, text, words[]}] with per-word timings for karaoke captions
    // the viewer de-overlaps rolling caption windows into one word stream, then pages it into box-sized
    // phrases that swap wholesale instead of scrolling a few words at a time
    "yt": "https://youtu.be/UA43kJX0Czw",
    "audio": true, "duration": 33.2
  }]
}
```

`symbol`/`aliases`/`features` come from `pipeline/minerals.json` (IMA symbols per Warr 2021, student shorthand aliases,
diagnostic optical features), joined in by `build.py` and validated by `check.py`. Extend search vocabulary by editing
that file; no viewer code change needed.

`video` may be a relative path (local dev) or an absolute Release-asset URL
(production, so the repo stays small). Everything else is committed.
