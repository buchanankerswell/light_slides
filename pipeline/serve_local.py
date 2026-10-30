#!/usr/bin/env python3
"""Range-capable static server for local testing (stdlib only).

`python -m http.server` (used by `make run`) does not honour HTTP Range
requests, so slider scrubbing re-buffers instead of seeking -- unlike the
GitHub Release CDN in production, which serves 206 partial content. This
server adds single-range 206 support so local scrub/seek behaviour matches
the published site.

Usage:
    python3 pipeline/serve_local.py --dir /tmp/ls-local-test --port 8812 [--base /light_slides]

Serves --dir at / and, when --base is given, also strips that prefix so the
viewer can be opened at http://127.0.0.1:8812/light_slides/ like production.
"""

import argparse
import functools
import mimetypes
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)$")


class RangeHandler(SimpleHTTPRequestHandler):
    base = ""

    def log_message(self, fmt, *args):
        pass  # keep output to one line per request below

    def translate_path(self, path):
        if self.base and path == self.base:
            path = "/"
        elif self.base and path.startswith(self.base + "/"):
            path = path[len(self.base):]
        return super().translate_path(path)

    def send_head(self):
        path = self.translate_path(self.path.split("?", 1)[0])
        if not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        rng = self.headers.get("Range")
        m = RANGE_RE.match(rng.strip()) if rng else None
        try:
            fh = open(path, "rb")  # noqa: SIM115 -- do_GET closes it after copyfile() sends the body
        except OSError:
            self.send_error(404, "not found")
            return None
        if not m or (not m.group(1) and not m.group(2)):
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(size))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            print(f"200 {self.path} ({size}B)")
            return fh
        first, last = m.group(1), m.group(2)
        if first:
            start = int(first)
            end = int(last) if last else size - 1
        else:
            start, end = size - int(last), size - 1  # suffix range
        if start >= size or end < start:
            fh.close()
            self.send_error(416, "range not satisfiable")
            return None
        end = min(end, size - 1)
        fh.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        print(f"206 {self.path} [{start}-{end}/{size}]")
        self._range_fh = fh
        self._range_left = end - start + 1
        return fh

    def copyfile(self, src, out):
        if not hasattr(self, "_range_fh") or src is not self._range_fh:
            return super().copyfile(src, out)
        left = self._range_left
        buf = 64 * 1024
        while left > 0:
            chunk = src.read(min(buf, left))
            if not chunk:
                break
            out.write(chunk)
            left -= len(chunk)
        del self._range_fh, self._range_left


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--port", type=int, default=8812)
    ap.add_argument("--base", default="/light_slides")
    a = ap.parse_args()
    handler = functools.partial(RangeHandler, directory=a.dir)
    RangeHandler.base = a.base.rstrip("/") if a.base else ""
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), handler)
    print(f"serving {a.dir} at http://127.0.0.1:{a.port}{RangeHandler.base or '/'}/ (range-capable, Ctrl-C to stop)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
