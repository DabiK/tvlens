"""Build a self-contained probe IPK, without installing or launching it."""
from pathlib import Path
import argparse,io,json,tarfile,time
base=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--app-dir',type=Path,default=base/'app');parser.add_argument('--output-dir',type=Path,default=base/'dist');args=parser.parse_args()
app=args.app_dir; meta=json.loads((app/'appinfo.json').read_text());ident=meta['id'];version=meta['version']
def archive(entries):
 b=io.BytesIO()
 with tarfile.open(fileobj=b,mode='w:gz') as t:
  for name,data in entries:
   info=tarfile.TarInfo(name);info.mode=0o644;info.size=len(data);t.addfile(info,io.BytesIO(data))
 return b.getvalue()
control=f'Package: {ident}\nVersion: {version}\nSection: misc\nPriority: optional\nArchitecture: all\nMaintainer: TVLens\nDescription: Reversible sidebar feasibility probe\nwebOS-Package-Format-Version: 2\n'
files=[('usr/palm/applications/'+ident+'/'+p.name,p.read_bytes()) for p in sorted(app.iterdir()) if p.is_file() and p.name != "connection.js"]
files.append(('usr/palm/packages/'+ident+'/packageinfo.json',json.dumps({'id':ident,'version':version,'app':ident}).encode()))
result=bytearray(b'!<arch>\n')
for name,data in [('debian-binary',b'2.0\n'),('control.tar.gz',archive([('control',control.encode())])),('data.tar.gz',archive(files))]:
 result.extend(f'{name+"/":<16}{int(time.time()):<12}{0:<6}{0:<6}{"100644":<8}{len(data):<10}`\n'.encode());result.extend(data)
 if len(data)%2:result.extend(b'\n')
out=args.output_dir;out.mkdir(parents=True,exist_ok=True);p=out/f'{ident}_{version}_all.ipk';p.write_bytes(result);print(p)
