"""Start/stop this isolated mapper; never stop unrelated input services."""
import fcntl,json,os,signal,subprocess,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
STATE=Path('/tmp/tvlens-remote-state')
ENTRY=str(ROOT/'runtime/tvlens_mapper.py')
DISABLED=ROOT/'disabled'

def owned_pid():
    try:
        pid=int(json.loads((STATE/'status.json').read_text()).get('pid') or 0)
        if pid<=1:return None
        command=Path('/proc/%d/cmdline'%pid).read_bytes().split(b'\0')
        return pid if ENTRY.encode() in command else None
    except (OSError,ValueError,TypeError):return None

def stop():
    pid=owned_pid()
    if pid:
        os.kill(pid,signal.SIGTERM)
        for _ in range(30):
            if owned_pid()!=pid:return
            time.sleep(.1)
        raise RuntimeError('Mapper did not stop; no unrelated process was killed')

def start():
    if DISABLED.exists():print('disabled');return
    if owned_pid():print('already running');return
    STATE.mkdir(exist_ok=True)
    with open(os.devnull,'wb') as log:
        child=subprocess.Popen([sys.executable or "/usr/bin/python3",'-u',ENTRY,'--config',str(ROOT/'rakuten.json'),
              '--state-dir',str(STATE),'--app-dir',str(ROOT),'--no-start-delay'],
              stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
    for _ in range(50):
        if owned_pid()==child.pid:print('running',child.pid);return
        if child.poll() is not None:raise RuntimeError('Mapper failed to start')
        time.sleep(.1)
    child.terminate()
    raise RuntimeError('Mapper did not report ready')

def main():
    action=sys.argv[1] if len(sys.argv)>1 else 'status'
    if action not in ('start','stop','enable','disable','status','boot'):raise SystemExit('Unknown action')
    STATE.mkdir(exist_ok=True)
    with open(STATE/'control.lock','w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        if action=='disable':DISABLED.touch();stop();print('disabled')
        elif action=='stop':stop();print('stopped')
        elif action=='enable':
            if DISABLED.exists():DISABLED.unlink()
            start()
        elif action=='status':print(json.dumps({'enabled':not DISABLED.exists(),'pid':owned_pid()}))
        elif action=='boot':
            for _ in range(30):
                if Path('/dev/input/event4').exists():break
                time.sleep(1)
            start()
        else:start()
if __name__=='__main__':main()
