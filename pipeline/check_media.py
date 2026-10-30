#!/usr/bin/env python3
"""Publish-contract check for hosted media (stdlib only, no video bytes).

Reads every video URL from docs/data/slides.json, follows redirects with
HEAD requests (never downloading bodies), and requires
Content-Type: video/mp4 with Accept-Ranges: bytes.

Rationale: Safari refuses anything else — GitHub Releases force
application/octet-stream on downloads, which surfaces as
NotSupportedError on play() — and neither curl spot checks nor the
headless-Chrome harness (which rewires to local files) catch it.

Usage: python3 pipeline/check_media.py
Exits non-zero listing every offending URL.
"""

import json
import sys
import urllib.request
from pathlib import Path
from urllib.error import HTTPError, URLError

BASE = Path(__file__).parent.parent
TIMEOUT = 30
MAX_HOPS = 5
# Identify as a browser: R2's edge challenges bare scripting user agents
# (e.g. Python-urllib gets 403s for objects browsers load fine), and the
# contract under test is precisely "will a browser play this".
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    # Never follow automatically: re-issue HEAD ourselves per hop so a
    # 302 can never silently become a body-downloading GET.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def head(url):
    opener = urllib.request.build_opener(NoRedirect)
    for _ in range(MAX_HOPS + 1):
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
        try:
            resp = opener.open(req, timeout=TIMEOUT)
            return resp.status, resp.headers
        except HTTPError as e:
            if e.code in (301, 302, 303, 307, 308) and e.headers.get("Location"):
                url = e.headers["Location"]
                continue
            return e.code, e.headers
    raise URLError(f"too many redirects for {url}")


def main():
    slides = json.loads((BASE / "docs" / "data" / "slides.json").read_text())["slides"]
    bad = []
    for s in slides:
        url = s["video"]
        try:
            status, headers = head(url)
        except Exception as e:  # noqa: BLE001 -- report, don't crash, per URL
            bad.append(f"{url}: request failed ({e})")
            continue
        ct = headers.get("Content-Type", "")
        ar = headers.get("Accept-Ranges", "")
        problems = []
        if status != 200:
            problems.append(f"status {status}")
        if "video/mp4" not in ct:
            problems.append(f"content-type {ct!r}")
        if ar != "bytes":
            problems.append(f"accept-ranges {ar!r}")
        if problems:
            bad.append(f"{url}: {'; '.join(problems)}")
    print(f"{len(slides) - len(bad)}/{len(slides)} host video/mp4 with ranges")
    if bad:
        print("\n".join(bad))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
