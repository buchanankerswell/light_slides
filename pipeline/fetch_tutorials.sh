#!/bin/zsh
# Reproducible fetch: tutorials only, 480p max, with audio + English auto-subs.
# Usage: ./fetch_tutorials.sh [outdir]
# Requires: yt-dlp, ffmpeg
set -e
OUTDIR=${1:-./raw}
mkdir -p "$OUTDIR"
PLAYLIST="PL8dDgAwuMuPTXCj0MPO_G6jTz4pzXVcZi"
yt-dlp --flat-playlist --print "%(title)s | %(id)s" "$PLAYLIST" \
  | grep -i -E "tutorial|how-to" > "$OUTDIR/tutorial_index.txt"
wc -l "$OUTDIR/tutorial_index.txt"
cd "$OUTDIR"
yt-dlp --no-playlist \
  -f "bv*[height<=720]+ba/b[height<=720]/b" --merge-output-format mp4 \
  --write-auto-subs --sub-langs "en" --sub-format "vtt" \
  --restrict-filenames -o "%(title)s [%(id)s].%(ext)s" \
  -a <(cut -d'|' -f2 tutorial_index.txt | sed 's/^ *https:\/\/youtu.be\///;s/^ *//;s/^/https:\/\/youtu.be\//')
