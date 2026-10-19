"""Détection du noir par tranches d’octets d’un BMP DISPLAY, sans dépendance externe."""
import math
import struct

CONTROL_WIDTH = 256
CONTROL_HEIGHT = 144
DISPLAY_WIDTH = 3840
DISPLAY_HEIGHT = 2160
BLACK_COMPONENT_MAX = 16
BMP_HEADER_SIZE = 54
BMP_INFO_SIZE = 40
BMP_CHANNELS = 3


def bmp_layout(bmp):
    if len(bmp) < BMP_HEADER_SIZE or bmp[:2] != b'BM':
        raise ValueError('Invalid control BMP header')
    size, reserved, pixel_offset = struct.unpack_from('<III', bmp, 2)
    info_size, width, height, planes, depth, compression, image_size = struct.unpack_from('<IiiHHII', bmp, 14)
    if size != len(bmp) or reserved or info_size != BMP_INFO_SIZE:
        raise ValueError('Unsupported control BMP header')
    if (width, abs(height)) != (CONTROL_WIDTH, CONTROL_HEIGHT) or planes != 1 or depth != 24 or compression:
        raise ValueError('Unsupported control BMP pixels')
    stride = (width * BMP_CHANNELS + 3) // 4 * 4
    expected = stride * abs(height)
    if pixel_offset < BMP_HEADER_SIZE or pixel_offset + expected != len(bmp) or image_size not in (0, expected):
        raise ValueError('Invalid control BMP pixel length')
    return pixel_offset, stride, height < 0


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


def is_black(bmp, rect):
    pixel_offset, stride, top_down = bmp_layout(bmp)
    left, top, right, bottom = video_bounds(rect)
    pixels = memoryview(bmp)
    for y in range(top, bottom):
        row = y if top_down else CONTROL_HEIGHT - 1 - y
        start = pixel_offset + row * stride
        if max(pixels[start + left * BMP_CHANNELS:start + right * BMP_CHANNELS]) > BLACK_COMPONENT_MAX:
            return False
    return True
