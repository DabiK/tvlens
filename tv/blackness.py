"""Détection du noir sur le rectangle vidéo d'un petit PNG DISPLAY, sans dépendance externe."""
import math
import struct
import zlib

CONTROL_WIDTH = 160
CONTROL_HEIGHT = 90
DISPLAY_WIDTH = 3840
DISPLAY_HEIGHT = 2160
BLACK_COMPONENT_MAX = 16
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
CHANNELS = {0: 1, 2: 3, 4: 2, 6: 4}


def png_data(png):
    if not png.startswith(PNG_SIGNATURE):
        raise ValueError('Invalid control PNG signature')
    offset = len(PNG_SIGNATURE)
    header = None
    compressed = bytearray()
    while offset + 12 <= len(png):
        size, kind = struct.unpack_from('>I4s', png, offset)
        end = offset + 8 + size
        if end + 4 > len(png):
            raise ValueError('Truncated control PNG chunk')
        data = png[offset + 8:end]
        checksum, = struct.unpack_from('>I', png, end)
        if zlib.crc32(kind + data) != checksum:
            raise ValueError('Invalid control PNG checksum')
        if header is None and kind != b'IHDR':
            raise ValueError('Missing control PNG header')
        if kind == b'IHDR':
            if header is not None or size != 13:
                raise ValueError('Invalid control PNG header')
            header = struct.unpack('>IIBBBBB', data)
        elif kind == b'IDAT':
            compressed.extend(data)
        elif kind == b'IEND':
            if size or end + 4 != len(png) or not compressed:
                raise ValueError('Invalid control PNG end')
            return header, bytes(compressed)
        elif not kind[0] & 32 and kind != b'PLTE':
            raise ValueError('Unsupported control PNG chunk')
        offset = end + 4
    raise ValueError('Incomplete control PNG')


def paeth(left, above, corner):
    estimate = left + above - corner
    distances = [abs(estimate - value) for value in (left, above, corner)]
    return (left, above, corner)[distances.index(min(distances))]


def decode_rows(header, compressed):
    width, height, depth, color, compression, filtering, interlace = header
    if (width, height) != (CONTROL_WIDTH, CONTROL_HEIGHT) or depth != 8 or color not in CHANNELS:
        raise ValueError('Unsupported control PNG pixels')
    if compression or filtering or interlace:
        raise ValueError('Unsupported control PNG encoding')
    channels = CHANNELS[color]
    stride = width * channels
    expected = height * (stride + 1)
    decoder = zlib.decompressobj()
    try:
        raw = decoder.decompress(compressed, expected + 1)
    except zlib.error as error:
        raise ValueError('Invalid control PNG compression') from error
    if len(raw) != expected or not decoder.eof or decoder.unused_data:
        raise ValueError('Invalid control PNG pixel length')
    previous = bytearray(stride)
    rows = []
    for offset in range(0, expected, stride + 1):
        filter_type = raw[offset]
        if filter_type > 4:
            raise ValueError('Unsupported control PNG filter')
        row = bytearray(raw[offset + 1:offset + 1 + stride])
        for index in range(stride):
            left = row[index - channels] if index >= channels else 0
            above = previous[index]
            corner = previous[index - channels] if index >= channels else 0
            predictors = (0, left, above, (left + above) // 2)
            prediction = paeth(left, above, corner) if filter_type == 4 else predictors[filter_type]
            row[index] = (row[index] + prediction) & 255
        rows.append(row)
        previous = row
    return rows, channels, color


def video_bounds(rect):
    x, y, width, height = (rect[key] for key in ('x', 'y', 'width', 'height'))
    if not all(math.isfinite(value) for value in (x, y, width, height)):
        raise ValueError('Invalid video rectangle')
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > DISPLAY_WIDTH or y + height > DISPLAY_HEIGHT:
        raise ValueError('Video rectangle outside display')
    # Les pixels de bord peuvent mêler sidebar et vidéo lors de la réduction : seuls les pixels intérieurs comptent.
    left = math.ceil(x * CONTROL_WIDTH / DISPLAY_WIDTH)
    top = math.ceil(y * CONTROL_HEIGHT / DISPLAY_HEIGHT)
    right = math.floor((x + width) * CONTROL_WIDTH / DISPLAY_WIDTH)
    bottom = math.floor((y + height) * CONTROL_HEIGHT / DISPLAY_HEIGHT)
    if left >= right or top >= bottom:
        raise ValueError('Empty control rectangle')
    return left, top, right, bottom


def is_black(png, rect):
    header, compressed = png_data(png)
    rows, channels, color = decode_rows(header, compressed)
    left, top, right, bottom = video_bounds(rect)
    components = 3 if color in (2, 6) else 1
    return all(row[x * channels + component] <= BLACK_COMPONENT_MAX
               for row in rows[top:bottom] for x in range(left, right) for component in range(components))
