#!/usr/bin/env python3
"""Inline each page's data into its template and write the shippable HTML.

Both pages ship as one self-contained file so they can be opened from disk or
served as a static asset with no build step and no API. The only external
requests are the font stylesheet and the map library, both from CDNs.

    python3 src/build.py            # build both
    python3 src/build.py tool       # build only index.html
    python3 src/build.py research   # build only research.html
"""
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARK = '/*__DATA__*/'

TARGETS = {
    'tool': ('src/tool.tmpl.html', 'data/tool_data.json', 'index.html'),
    'research': ('src/research.tmpl.html', 'data/share_page_data.json', 'research.html'),
}


def build(name):
    tmpl_p, data_p, out_p = (os.path.join(ROOT, x) for x in TARGETS[name])
    tmpl = io.open(tmpl_p, encoding='utf-8').read()
    raw = io.open(data_p, encoding='utf-8').read()

    json.loads(raw)  # fail loudly rather than shipping a page with broken data
    if tmpl.count(MARK) != 1:
        raise SystemExit('%s: expected exactly one %s, found %d'
                         % (tmpl_p, MARK, tmpl.count(MARK)))

    # the placeholder sits as `= /*__DATA__*/{};` so the template stays valid JS
    out = tmpl.replace(MARK + '{}', raw) if (MARK + '{}') in tmpl else tmpl.replace(MARK, raw)
    io.open(out_p, 'w', encoding='utf-8').write(out)
    print('%-9s -> %s  (%d bytes)' % (name, os.path.relpath(out_p, ROOT),
                                      len(out.encode('utf-8'))))


if __name__ == '__main__':
    names = sys.argv[1:] or list(TARGETS)
    for n in names:
        if n not in TARGETS:
            raise SystemExit('unknown target %r; choose from %s' % (n, ', '.join(TARGETS)))
        build(n)
