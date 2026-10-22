"""Download each oracle v4 source page once into a frozen corpus: raw page (gzip), extracted text, and a manifest with
SHA-256, size, HTTP status and date. Run once; later trials read the corpus without network.

Usage: python3 -I figer_corpus.py <urls.json> <corpus dir>
"""
import datetime
import gzip
import hashlib
import html.parser
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

USER_AGENT = "Mozilla/5.0 (compatible; TVLens-corpus/1.0; one-off research snapshot)"
TIMEOUT_S = 30


class TextExtractor(html.parser.HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "header"}

    def __init__(self):
        super().__init__()
        self.parts, self.depth, self.title, self.in_title = [], 0, "", False

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.depth += 1
        if tag == "title":
            self.in_title = True
        if tag in ("p", "br", "li", "h1", "h2", "h3", "h4", "tr", "div"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.depth:
            self.depth -= 1
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        elif not self.depth:
            self.parts.append(data)


def main():
    urls, root = json.loads(Path(sys.argv[1]).read_text()), Path(sys.argv[2])
    manifest = []
    for index, url in enumerate(urls, 1):
        key = hashlib.sha256(url.encode()).hexdigest()[:16]
        row = {"url": url, "key": key, "fetchedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "fr,en;q=0.8"})
            with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
                raw, row["status"], row["contentType"] = response.read(), response.status, response.headers.get("Content-Type")
        except urllib.error.HTTPError as error:
            raw, row["status"], row["contentType"] = b"", error.code, error.headers.get("Content-Type")
        except Exception as error:
            raw, row["status"], row["error"] = b"", None, type(error).__name__
        if raw:
            (root / "brut" / (key + ".gz")).write_bytes(gzip.compress(raw, mtime=0))
            parser = TextExtractor()
            parser.feed(raw.decode("utf-8", "replace"))
            text = "\n".join(line.strip() for line in "".join(parser.parts).splitlines() if line.strip())
            (root / "texte" / (key + ".txt")).write_text(text)
            row.update({"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "title": " ".join(parser.title.split()),
                        "textChars": len(text), "textSha256": hashlib.sha256(text.encode()).hexdigest()})
        manifest.append(row)
        print(index, row.get("status"), row.get("textChars"), url[:90], flush=True)
    (root / "manifeste.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
