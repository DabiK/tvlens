# Sonde en lecture seule : formats acceptés par executeOneShot DISPLAY 256x144, taille et en-tête rendus ; fichiers supprimés.
import json, os, subprocess, time
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
for fmt in ['BMP', 'JPEG', 'JPG', 'RGB', 'RAW', 'YUV', 'NV12']:
    p = '/tmp/tvlens-sonde-controle.' + fmt.lower()
    if os.path.exists(p): os.remove(p)
    t0 = time.monotonic(); r = luna('com.webos.service.capture/executeOneShot', {'path': p, 'method': 'DISPLAY', 'format': fmt, 'width': 256, 'height': 144}); t1 = time.monotonic()
    d = open(p, 'rb').read() if os.path.exists(p) else b''
    print(fmt, round((t1 - t0) * 1000), 'ms', r.get('returnValue'), r.get('errorText'), len(d), 'octets', d[:2], (int.from_bytes(d[18:22], 'little'), int.from_bytes(d[22:26], 'little', signed=True), int.from_bytes(d[28:30], 'little'), int.from_bytes(d[10:14], 'little')) if d[:2] == b'BM' else '')
    if os.path.exists(p): os.remove(p)
