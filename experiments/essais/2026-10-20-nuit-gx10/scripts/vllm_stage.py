"""Installation isolée puis comparaison Ollama → vLLM, sans changer TVLens."""
from pathlib import Path
import socket
import time
import urllib.request
from night_common import api, capture, read, utc, write

IMAGE_DIGEST = 'sha256:2a7cde230b59f3ce6cab33dd245ba6bee41aa87b38c9fe84f966ff24016813ce'
IMAGE = 'vllm/vllm-openai@' + IMAGE_DIGEST
MODEL = 'nvidia/Qwen3.8-27B-NVFP4'
REVISION = '482ca0f3832238542f8f5295dde86b5f22711d80'


def probe(night, package, repo, backend, identity=None):
    out = night.root / ('answers-' + backend)
    argv = ['node', package / 'client/sonder.cjs', '--repo', repo, '--corpus', package / 'client/corpus.json',
            '--backend', backend, '--repeats', '2', '--out', out, '--execute']
    if identity:
        argv += ['--identity-file', identity]
    night.command('probe-' + backend, argv, 1260, cwd=repo)
    report = read(out / 'campaign.json')
    if report.get('complete') is not True or len(report.get('cases', [])) != 20:
        raise RuntimeError('PROBE_INCOMPLETE:' + backend)
    if any(row.get('status') != 'returned' or row.get('fixtureServer') for row in report['cases']):
        raise RuntimeError('PROBE_FAILED:' + backend)


def download(night, package, cache):
    night.command('docker-pull', ['docker', 'pull', '--platform', 'linux/arm64', IMAGE], 3600)
    metadata = capture(['docker', 'image', 'inspect', IMAGE])
    write(night.root / 'docker-image.json', metadata)
    if metadata.get('exitCode') != 0:
        raise RuntimeError('IMAGE_INSPECTION_FAILED')
    import json
    details = json.loads(metadata['stdout'])[0]
    if details.get('Architecture') != 'arm64':
        raise RuntimeError('IMAGE_ARCHITECTURE_MISMATCH')
    script = (package / 'scripts/download_model.py').read_text()
    night.container('model-download', ['--entrypoint', 'python3',
                  '-e', 'HF_HUB_DISABLE_IMPLICIT_TOKEN=1', '-e', 'HF_HUB_DISABLE_TELEMETRY=1',
                  '-v', str(cache) + ':/cache', IMAGE, '-c', script], 5400)
    night.command('model-hashes', ['python3', package / 'scripts/hash_model.py', cache,
                                 night.root / 'model-files.json'], 1200)


def start_server(night, cache):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 8001))
    model_path = '/cache/models--nvidia--Qwen3.8-27B-NVFP4/snapshots/' + REVISION
    argv = ['-d', '--device', 'nvidia.com/gpu=all',
            '--network', 'host', '--shm-size', '8g', '--memory', '80g', '--memory-swap', '80g',
            '-e', 'NVIDIA_VISIBLE_DEVICES=void', '-e', 'HF_HUB_DISABLE_IMPLICIT_TOKEN=1',
            '-e', 'HF_HUB_OFFLINE=1', '-e', 'HF_HUB_DISABLE_TELEMETRY=1', '-e', 'VLLM_NO_USAGE_STATS=1',
            '-v', str(cache) + ':/cache:ro', '--entrypoint', 'vllm', IMAGE, 'serve', model_path,
            '--served-model-name', MODEL, '--host', '127.0.0.1', '--port', '8001',
            '--kv-cache-dtype', 'fp8', '--gpu-memory-utilization', '0.45', '--max-model-len', '16384',
            '--max-num-seqs', '1', '--max-num-batched-tokens', '4096', '--enable-chunked-prefill',
            '--limit-mm-per-prompt', '{"image":1,"video":0}', '--load-format', 'safetensors',
            '--generation-config', 'vllm', '--reasoning-parser', 'qwen3']
    night.container('vllm-start', argv, 120)
    cid = (night.root / 'vllm-start.cid').read_text().strip()
    night.event('vllm-loading')
    started = time.monotonic()
    while time.monotonic() - started < 1800:
        night.check()
        state = capture(['docker', 'inspect', '--format', '{{.State.Running}}', cid])
        if state.get('stdout', '').strip() != 'true':
            raise RuntimeError('VLLM_CONTAINER_EXITED')
        try:
            models = api('http://127.0.0.1:8001/v1/models')
            if MODEL in [row['id'] for row in models.get('data', [])]:
                write(night.root / 'vllm-ready.json', {'atUtc': utc(), 'loadSeconds': time.monotonic() - started, 'models': models})
                return cid
        except (OSError, ValueError):
            pass
        night.sleep(5)
    raise RuntimeError('VLLM_STARTUP_DEADLINE')


def compare(night, package, repo):
    # Aucun vLLM résident pendant ce bras ; ordre exploratoire fixé, sans prétendre AB/BA.
    probe(night, package, repo, 'ollama')
    cache = night.root.parent / ('huggingface-' + night.owner)
    cache.mkdir()
    download(night, package, cache)
    code = ('import json,torch,vllm; print(json.dumps({"torch":torch.__version__,"cuda":torch.version.cuda,'
            '"vllm":vllm.__version__,"device":torch.cuda.get_device_name(0),"capability":torch.cuda.get_device_capability(0)}));'
            'assert torch.cuda.is_available(); assert torch.cuda.get_device_capability(0)==(12,1)')
    checked = night.container('gpu-check', ['--device', 'nvidia.com/gpu=all',
                            '-e', 'NVIDIA_VISIBLE_DEVICES=void', '--entrypoint', 'python3', IMAGE, '-c', code], 120)
    import json
    lines = (checked / 'stdout.log').read_text().splitlines()
    version = next(json.loads(line) for line in reversed(lines) if line.startswith('{') and '"vllm"' in line)
    identity = night.root / 'vllm-identity.json'
    write(identity, {'modelRevision': REVISION, 'imageDigest': IMAGE_DIGEST, 'vllmVersion': version['vllm'],
                     'maxModelLen': 16384, 'generationConfig': 'vllm', 'fixture': False})
    start_server(night, cache)
    for phase in ['before', 'after']:
        if phase == 'after':
            probe(night, package, repo, 'vllm', identity)
        try:
            with urllib.request.urlopen('http://127.0.0.1:8001/metrics', timeout=3) as response:
                (night.root / ('vllm-metrics-' + phase + '.txt')).write_bytes(response.read())
        except OSError as error:
            write(night.root / ('vllm-metrics-' + phase + '-error.json'), {'type': type(error).__name__})
