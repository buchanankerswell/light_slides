#!/usr/bin/env python3
"""Derive a stable slide id from a raw yt-dlp filename stem.

Single source for the stem -> sid mapping used by build.py and the
Makefile cues loop. Usage: python3 sid.py "Olivine_tutorial_Optical_mineralogy_[trAGVNlg1Bo]"
"""

import re
import sys


# yt-dlp --restrict-filenames strips characters the registry keeps
# (slashes, parentheses), so map those titles back explicitly.
TITLE_FIXES = {
    "Actinolite tremolite": "Actinolite/tremolite",
    "Anthophyllite gedrite": "Anthophyllite/gedrite",
    "Coesite pseudomorph": "Coesite (pseudomorph)",
}


def title_for_stem(stem):
    """Split a raw stem into (mineral title, youtube id).

    Handles yt-dlp --restrict-filenames stems in either underscore or
    space form, stripping the tutorial suffix case-insensitively
    (uploads mix 'Optical' and 'optical').
    """
    m = re.match(r"(.*)[_ ]\[([A-Za-z0-9_-]{11})\]$", stem)
    if not m:
        return TITLE_FIXES.get(stem.replace("_", " ").strip(), stem.replace("_", " ").strip()), ""
    title = re.sub(r"\s+tutorial\s+optical\s+(mineralogy|petrography)\s*$", "", m.group(1).replace("_", " "), flags=re.IGNORECASE)
    return TITLE_FIXES.get(title.strip(), title.strip()), m.group(2)


def sid_for_stem(stem):
    title, _ = title_for_stem(stem)
    return re.sub(r"\W+", "-", title.lower()).strip("-")


if __name__ == "__main__":
    print(sid_for_stem(sys.argv[1]))
