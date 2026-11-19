#!/usr/bin/env python3
"""Local web server for the Pi kiosk.

Same as `python3 -m http.server`, but tells the browser not to keep copies of
the files. Without this, Chromium can keep running an old version of the sketch
after new files are copied onto the Pi, until its cache is cleared by hand.

Usage: python3 serve.py [port]   (default 8000, localhost only)
"""
import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    here = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoCacheHandler, directory=here)
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as server:
        print(f'Serving {here} at http://localhost:{port} (no caching)')
        server.serve_forever()
