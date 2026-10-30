# Light Slides: a thin-section viewer for teaching mineralogy

📚 See [buchanankerswell.com/light_slides](https://buchanankerswell.com/light_slides) for the live site.

A minimal static viewer for optical mineralogy tutorials: scrub the microscope stage forwards and backwards with a slider and read the synced commentary. Pure HTML, CSS, and vanilla JavaScript; videos stream from a GitHub Release so the site stays small.

## Prerequisite software

This project uses [python](https://www.python.org) for its media pipeline. For most users, I recommend installing the [miniforge](https://github.com/conda-forge/miniforge) python distribution. This distributions includes a minimal installation of python and the package manager [conda](https://docs.conda.io/en/latest/), which is required to build the necessary python environment for this software.

For macOS users, miniforge can be installed with [homebrew](https://brew.sh):

```bash
brew install miniforge
```

## Installation Guide

To install with Conda (recommended):

``` bash
# Create conda environment with ffmpeg, yt-dlp, and faster-whisper
make environment

# Activate conda environment
conda activate light-slides
```

## Usage Guide

After installing, serve the viewer from the command line:

``` bash
# Activate conda environment
conda activate light-slides

# Serve viewer (UI at http://127.0.0.1:8811/)
make run
```

Local testing (no conda, no release needed): `make run-local` builds a
publish-faithful test tree in `/tmp/ls-local-test` — same posters, cues,
CSS, JS, and video bytes, with video URLs rewired to local files — and
serves it with HTTP Range support at the production `/light_slides`
subpath (UI at http://127.0.0.1:8812/light_slides/). `make verify-local`
runs the headless-browser pass over it (seek, captions, search, overflow,
video-error fallback) and writes screenshots to `/tmp/ls-local-shots/`.

Rebuild the site from the source videos:

``` bash
make fetch          # download tutorials + auto-subs into pipeline/raw
make cues           # transcribe audio with faster-whisper into pipeline/cues
make build          # encode + posters + slides.json into the docs dir
make release-media  # upload encoded videos to the R2 media bucket
```

Run `make help` for the full target list and `make test` to validate the built data.

## Workflow

`make fetch` downloads the tutorial videos with audio. `make cues` transcribes each one with faster-whisper, applying a reviewable list of mineral-term corrections. `make build` re-encodes the videos, extracts poster frames, and writes a single `slides.json` manifest that the viewer reads. The viewer is one `<video>` element: the slider sets `currentTime`, and the transcript highlights the cue under the playhead.

## Acknowledgement

These videos and tutorials were produced by [Matt Kohn](https://scholar.google.com/citations?user=xSyB1KQAAAAJ&hl=en&oi=ao) (Boise State University) from hours of filming petrographic slides from his own personal research library.
