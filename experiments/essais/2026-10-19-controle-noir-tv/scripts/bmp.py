# Sonde en lecture seule : contrôle du noir sur un BMP DISPLAY 256x144 par tranches d'octets ; fichier supprimé.
import json, math, os, struct, subprocess, time
def luna(uri, payload):
    r = subprocess.run(['luna-send', '-t', '1', '-w', '3000', 'luna://' + uri, json.dumps(payload)], capture_output=True, timeout=5)
    for stream in (r.stderr.decode('utf-8', 'replace'), r.stdout.decode('utf-8', 'replace')):
        m = stream.find('timingServiceResponse'); c = stream[m:] if m >= 0 else stream; s = c.find('{')
        if s < 0: continue
        try:
            v, _ = json.JSONDecoder().raw_decode(c[s:])
            if isinstance(v, dict) and 'returnValue' in v: return v
        except ValueError: continue
    return {}
W, H, P = 256, 144, '/tmp/tvlens-sonde-controle.bmp'
def brightest(bmp, rect):
    offset, = struct.unpack_from('<I', bmp, 10); width, height = struct.unpack_from('<ii', bmp, 18); bits, = struct.unpack_from('<H', bmp, 28)
    assert (width, abs(height), bits) == (W, H, 24)
    stride = (width * 3 + 3) & ~3
    left = math.ceil(rect['x'] * W / 3840); right = math.floor((rect['x'] + rect['width']) * W / 3840)
    top = math.ceil(rect['y'] * H / 2160); bottom = math.floor((rect['y'] + rect['height']) * H / 2160)
    rows = range(top, bottom) if height < 0 else range(H - bottom, H - top)
    return max(max(bmp[offset + r * stride + left * 3:offset + r * stride + right * 3]) for r in rows)
v = [x for x in luna('com.webos.service.videooutput/getStatus', {})['video'] if x['sink'] == 'MAIN'][0]
for i in range(3):
    t0 = time.monotonic(); luna('com.webos.service.capture/executeOneShot', {'path': P, 'method': 'DISPLAY', 'format': 'BMP', 'width': W, 'height': H}); t1 = time.monotonic()
    bmp = open(P, 'rb').read(); os.remove(P)
    t2 = time.monotonic(); b = brightest(bmp, v['displayOutput']); t3 = time.monotonic()
    print('prise', round((t1 - t0) * 1000), 'ms', 'contrôle', round((t3 - t2) * 1000, 1), 'ms', 'composante max', b, 'app', v.get('appId'))
