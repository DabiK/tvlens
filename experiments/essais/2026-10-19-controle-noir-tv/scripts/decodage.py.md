Le script de décodage n'est pas un fichier à part : `tv/blackness.py` de l'arbre de travail de T301 (19/10, non encore
intégré), suivi de ce bloc, envoyé ensemble à `python3 -` sur la TV. Rien n'est installé ni gardé sur la TV.

```python
# --- Sonde : décodage du détecteur sur la TV, tailles de contrôle acceptées ; rien n'est installé ni gardé.
for _w, _h in [(256, 144), (320, 180)]:
    CONTROL_WIDTH, CONTROL_HEIGHT = _w, _h
    _luna('com.webos.service.capture/executeOneShot', {'path': _P, 'method': 'DISPLAY', 'format': 'PNG', 'width': _w, 'height': _h})
    _png = open(_P, 'rb').read(); _os.remove(_P)
    _t0 = _time.monotonic(); _header, _data = png_data(_png); _rows, _ch, _color = decode_rows(_header, _data); _t1 = _time.monotonic()
    _black = is_black(_png, {'x': 0, 'y': 0, 'width': 3840, 'height': 2160}); _t2 = _time.monotonic()
    print(f'{_w}x{_h}', 'décodage', round((_t1 - _t0) * 1000), 'ms', 'is_black complet', round((_t2 - _t1) * 1000), 'ms', 'noir', _black)
```

`_luna` reprend l'appel de `tv/luna.py` (`luna-send -t 1 -w 3000`, réponse lue après `timingServiceResponse`).
