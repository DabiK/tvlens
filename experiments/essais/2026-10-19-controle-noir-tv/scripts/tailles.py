# Sonde en lecture seule : tailles acceptées par executeOneShot DISPLAY en PNG, raison du refus, en-tête rendu.
import json, os, struct, subprocess, time
P = '/tmp/tvlens-sonde-controle.png'
def luna(uri, payload):
    r = subprocess.run(['luna-send', '-t', '1', '-w', '3000', 'luna://' + uri, json.dumps(payload)], capture_output=True, timeout=5)
    for stream in (r.stderr.decode('utf-8', 'replace'), r.stdout.decode('utf-8', 'replace')):
        marker = stream.find('timingServiceResponse'); candidate = stream[marker:] if marker >= 0 else stream
        start = candidate.find('{')
        if start < 0: continue
        try:
            value, _ = json.JSONDecoder().raw_decode(candidate[start:])
            if isinstance(value, dict) and 'returnValue' in value: return value
        except ValueError: continue
    return {}
for w, h in [(160, 90), (160, 96), (192, 108), (256, 144), (320, 180), (480, 270), (640, 360), (960, 540), (1280, 720)]:
    if os.path.exists(P): os.remove(P)
    t0 = time.monotonic(); r = luna('com.webos.service.capture/executeOneShot', {'path': P, 'method': 'DISPLAY', 'format': 'PNG', 'width': w, 'height': h}); t1 = time.monotonic()
    d = open(P, 'rb').read() if os.path.exists(P) else b''
    head = struct.unpack('>IIBBBBB', d[16:29]) if len(d) > 29 else None
    print(f'{w}x{h}', round((t1 - t0) * 1000), 'ms', r.get('returnValue'), r.get('errorCode'), r.get('errorText'), len(d), 'octets', head)
if os.path.exists(P): os.remove(P)
