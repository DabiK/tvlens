"""Build a labelled contact sheet of the 2-second reference frames of one video between two times.

Usage: python3 -I planche.py --frames <dir of 00001.jpg…> --from 540 --to 600 --out sheet.jpg
Frame n (1-based) was sampled at about (n - 1) * 2 seconds.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw

STEP_S = 2
COLUMNS = 4
WIDTH = 400
MAX_FRAMES = 24


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--frames", required=True)
    parser.add_argument("--from", dest="start", type=float, required=True)
    parser.add_argument("--to", dest="end", type=float, required=True)
    parser.add_argument("--every", type=float, default=STEP_S, help="seconds between shown frames (multiple of 2)")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    times = []
    t = args.start - args.start % STEP_S
    while t <= args.end and len(times) < MAX_FRAMES:
        times.append(t)
        t += max(STEP_S, args.every)
    tiles = []
    for t in times:
        path = Path(args.frames) / ("%05d.jpg" % (int(t // STEP_S) + 1))
        if not path.exists():
            continue
        image = Image.open(path)
        image = image.resize((WIDTH, int(image.height * WIDTH / image.width)))
        draw = ImageDraw.Draw(image)
        label = "%d:%02d:%02d" % (t // 3600, t % 3600 // 60, t % 60) if t >= 3600 else "%02d:%02d" % (t // 60, t % 60)
        draw.rectangle([0, 0, 74, 22], fill="black")
        draw.text((5, 5), label, fill="yellow")
        tiles.append(image)
    if not tiles:
        raise SystemExit("no frame in range")
    rows = (len(tiles) + COLUMNS - 1) // COLUMNS
    sheet = Image.new("RGB", (COLUMNS * WIDTH, rows * tiles[0].height), "white")
    for index, tile in enumerate(tiles):
        sheet.paste(tile, ((index % COLUMNS) * WIDTH, (index // COLUMNS) * tile.height))
    sheet.save(args.out, quality=85)
    print(args.out, len(tiles), "frames")


if __name__ == "__main__":
    main()
