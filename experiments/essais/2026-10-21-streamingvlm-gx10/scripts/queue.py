"""File GX10 exclusive : nuit, sonde Qwen, puis StreamingVLM borné."""
import argparse
import datetime
import fcntl
import json
import os
from pathlib import Path
import platform
import re
import shutil
import sys
import time


DEADLINE = datetime.datetime(2026, 10, 21, 12, tzinfo=datetime.timezone.utc)
UPSTREAM_COMMIT = 'a940d8cbfa14eefe651b7f4adeb81825c28cc6c6'
MODEL = 'mit-han-lab/StreamingVLM'
REVISION = '7ac1cef46d20432053a9814838760318cb26b348'
VIDEO_SHA256 = 'c2c678f2a70338c060b33608bc34d0a1050cd284e249814b3dac0d85eaaa443a'
DECORD_COMMIT = '6a3617cef035535193f390f86399dde139fa2a53'
FFMPEG_VERSION = '4.4.8'
FFMPEG_SHA256 = 'c73848c4ae283d9eaee7be3b276affbc3543380483555500d0dd2c9b7e1c39c3'
PYTHON_PINS = {'transformers': '4.52.4', 'qwen-vl-utils': '0.0.11',
               'decord': '0.6.0', 'accelerate': '1.8.1',
               'ffmpeg-python': '0.2.0',
               'tokenizers': '0.21.2', 'huggingface-hub': '0.34.4'}
MIB = 1024 ** 2
GIB = 1024 ** 3


def finished(root, ops):
    status_file = root / 'status.json'
    seal_file = root / 'integrite.json'
    if not status_file.exists():
        return False
    status = ops.read(status_file)
    if status.get('status') in ('blocked', 'cleanup-failed'):
        raise RuntimeError('PREDECESSOR_FAILED:' + str(root))
    if status.get('status') != 'finished' or status.get('cleanupConfirmed') is not True:
        return False
    if not seal_file.exists():
        return False
    seal = ops.read(seal_file).get('files', {})
    for name in ('status.json', 'events.jsonl'):
        if seal.get(name) != ops.digest(root / name):
            raise RuntimeError('PREDECESSOR_SEAL_INVALID:' + str(root))
    events = (root / 'events.jsonl').read_text().splitlines()
    if not events or json.loads(events[-1]).get('status') != 'finished':
        raise RuntimeError('PREDECESSOR_FINISH_EVENT_MISSING:' + str(root))
    return True


def acquire(paths):
    handles = []
    try:
        for path in paths:
            handle = Path(path).open('a+b')
            handles.append(handle)
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return handles
    except (OSError, BlockingIOError):
        for handle in handles:
            handle.close()
        return None


def gate(night, args, ops):
    roots = (args.night_root, args.sidecar_root)
    lock_paths = (args.night_lock, args.gpu_lock, args.reference_lock)
    night.event('waiting-predecessors')
    while True:
        if datetime.datetime.now(datetime.timezone.utc) >= DEADLINE:
            raise RuntimeError('PREDECESSOR_DEADLINE')
        night.check()
        states = [finished(root, ops) for root in roots]
        if all(states):
            handles = acquire(lock_paths)
            if handles:
                try:
                    if not all(finished(root, ops) for root in roots):
                        raise RuntimeError('PREDECESSOR_CHANGED_AFTER_LOCK')
                    record = {'atUtc': ops.utc(), 'predecessors': [
                        {'root': str(root), 'statusSha256': ops.digest(root / 'status.json'),
                         'sealSha256': ops.digest(root / 'integrite.json'),
                         'ollamaArm': ops.read(root / 'status.json').get('ollamaArm')}
                        for root in roots], 'locks': [str(path) for path in lock_paths]}
                    ops.write(night.root / 'gate.json', record)
                    night.event('predecessors-locked')
                    return handles
                except BaseException:
                    for handle in handles:
                        handle.close()
                    raise
        night.sleep(15)


def captured(night, ops, argv):
    result = ops.capture(argv)
    with (night.root / 'captured-commands.jsonl').open('a') as stream:
        stream.write(json.dumps({'atUtc': ops.utc(), 'argv': [str(x) for x in argv],
                                 'result': result}, ensure_ascii=False) + '\n')
        stream.flush()
        os.fsync(stream.fileno())
    return result


def memory_available():
    return next(int(line.split()[1]) * 1024 for line in Path('/proc/meminfo').read_text().splitlines()
                if line.startswith('MemAvailable:'))


def resources(night, ops, phase, min_disk=80 * GIB):
    gpu = captured(night, ops, ['nvidia-smi', '--query-compute-apps=pid', '--format=csv,noheader,nounits'])
    replay = captured(night, ops, ['pgrep', '-f', 'replay-local-(stream|perception)|replay-reinspection'])
    try:
        resident = ops.api('http://127.0.0.1:11434/api/ps')
    except (OSError, ValueError) as error:
        resident = {'error': type(error).__name__}
    record = {'atUtc': ops.utc(), 'freeDiskBytes': shutil.disk_usage(night.root).free,
              'availableMemoryBytes': memory_available(), 'gpuProcesses': gpu,
              'replays': replay, 'ollamaResident': resident}
    ops.write(night.root / ('resources-' + phase + '.json'), record)
    if record['freeDiskBytes'] < min_disk or record['availableMemoryBytes'] < 32 * GIB:
        raise RuntimeError('RESOURCES_LOW')
    if gpu.get('exitCode') != 0 or replay.get('exitCode') != 1:
        raise RuntimeError('GPU_OR_REPLAY_UNKNOWN')
    lines = gpu.get('stdout', '').strip()
    if lines and 'No running processes found' not in lines:
        raise RuntimeError('GPU_BUSY')
    if not isinstance(resident.get('models'), list) or resident['models']:
        raise RuntimeError('OLLAMA_RESIDENT_OR_UNKNOWN')
    return record


def wait_idle(night, ops, limit):
    attempt = 0
    while time.monotonic() < limit:
        night.check()
        try:
            resources(night, ops, 'idle-' + str(attempt))
            return
        except RuntimeError as error:
            if str(error) not in ('GPU_BUSY', 'OLLAMA_RESIDENT_OR_UNKNOWN'):
                raise
        attempt += 1
        night.sleep(15)
    raise RuntimeError('GPU_IDLE_DEADLINE')


def bounded(night, started, phase_end, wanted):
    remaining = min(night.deadline, started + 3.5 * 3600, phase_end) - time.monotonic()
    if remaining < 30:
        raise RuntimeError('PILOT_TIME_BUDGET_EXHAUSTED')
    return min(wanted, remaining)


def verify_source(night, args, ops):
    commit = captured(night, ops, ['git', '-C', str(args.upstream), 'rev-parse', 'HEAD'])
    dirty = captured(night, ops, ['git', '-C', str(args.upstream), 'status', '--porcelain', '--',
                                  'streaming_vlm', 'infer_requirements.txt', 'scripts/env_infer.sh'])
    ops.write(night.root / 'upstream-identity.json', {'commit': commit, 'dirty': dirty})
    if (commit.get('exitCode') != 0 or commit.get('stdout', '').strip() != UPSTREAM_COMMIT or
            dirty.get('exitCode') != 0 or dirty.get('stdout', '').strip()):
        raise RuntimeError('UPSTREAM_IDENTITY_MISMATCH')


def package_versions(night, ops, image, stage, timeout):
    script = ("import json,importlib.metadata as m,torch\n"
              "names=['transformers','qwen-vl-utils','decord','accelerate',"
              "'ffmpeg-python','tokenizers','huggingface-hub',"
              "'torch','flash-attn']\n"
              "versions={}\n"
              "for name in names:\n"
              "  try: versions[name]=m.version(name)\n"
              "  except m.PackageNotFoundError: versions[name]=None\n"
              "print(json.dumps({'packages':versions,'cuda':torch.version.cuda}))\n")
    folder = night.container(stage, ['--network', 'none', '--entrypoint', 'python3',
                                      image, '-c', script], timeout)
    lines = (folder / 'stdout.log').read_text().splitlines()
    data = next(json.loads(line) for line in reversed(lines) if line.startswith('{') and 'packages' in line)
    ops.write(night.root / (stage + '.json'), data)
    return data


def dependency_dockerfile(base_image, wheels, build_decord):
    lines = ['FROM ' + base_image]
    if wheels:
        lines.append('RUN python3 -m pip install --disable-pip-version-check --no-input '
                     '--no-cache-dir --only-binary=:all: --no-deps ' + ' '.join(wheels))
    if build_decord:
        lines += [
            'RUN apt-get update && apt-get install -y --no-install-recommends '
            'build-essential cmake pkg-config git curl xz-utils ca-certificates '
            'python3-dev python3-setuptools '
            '&& rm -rf /var/lib/apt/lists/*',
            'RUN curl -fsSL https://ffmpeg.org/releases/ffmpeg-' + FFMPEG_VERSION +
            '.tar.xz -o /tmp/ffmpeg.tar.xz && echo "' + FFMPEG_SHA256 +
            '  /tmp/ffmpeg.tar.xz" | sha256sum -c - && '
            'mkdir -p /opt/ffmpeg-source && tar -xJf /tmp/ffmpeg.tar.xz '
            '--strip-components=1 -C /opt/ffmpeg-source',
            'RUN cd /opt/ffmpeg-source && ./configure --prefix=/opt/ffmpeg4 '
            '--enable-shared --disable-static --disable-programs --disable-doc '
            '--disable-debug --disable-autodetect --enable-pic && make -j4 && make install '
            '&& echo /opt/ffmpeg4/lib > /etc/ld.so.conf.d/tvlens-ffmpeg4.conf && ldconfig',
            'RUN git clone --depth 1 --branch v0.6.0 --recurse-submodules '
            'https://github.com/dmlc/decord.git /opt/decord && '
            'test "$(git -C /opt/decord rev-parse HEAD)" = "' + DECORD_COMMIT + '" && '
            'cmake -S /opt/decord -B /opt/decord/build -DUSE_CUDA=0 '
            '-DFFMPEG_DIR=/opt/ffmpeg4 -DCMAKE_BUILD_TYPE=Release '
            '-DCMAKE_BUILD_WITH_INSTALL_RPATH=ON -DCMAKE_INSTALL_RPATH=/opt/ffmpeg4/lib && '
            'cmake --build /opt/decord/build -j4 && '
            'cd /opt/decord/python && python3 setup.py bdist_wheel && '
            'python3 -m pip install --no-deps dist/decord-0.6.0-*.whl',
        ]
    return '\n'.join(lines) + '\n'


def isolated_dependencies(night, args, ops, started, phase_end):
    before = package_versions(night, ops, args.image, 'base-packages',
                              bounded(night, started, phase_end, 180))
    missing = [f'{name}=={version}' for name, version in PYTHON_PINS.items()
               if name != 'decord' and before['packages'].get(name) != version]
    build_decord = before['packages'].get('decord') != PYTHON_PINS['decord']
    if not missing and not build_decord:
        return args.image
    context = night.root / 'dependency-layer'
    context.mkdir()
    dockerfile = dependency_dockerfile(args.image, missing, build_decord)
    (context / 'Dockerfile').write_text(dockerfile)
    ops.write(night.root / 'dependency-plan.json', {'baseImage': args.image,
              'baseVersions': before, 'pins': PYTHON_PINS, 'install': missing,
              'binaryWheelsOnly': True, 'noDependencies': True,
              'decordSourceBuild': build_decord, 'decordCommit': DECORD_COMMIT,
              'decordCuda': False, 'ffmpegVersion': FFMPEG_VERSION,
              'ffmpegSourceSha256': FFMPEG_SHA256, 'pyAvInstalled': False})
    tag = 'tvlens-streaming-' + night.owner + ':dependencies'
    night.command('dependency-build', ['docker', 'build', '--pull=false', '--network=bridge',
                  '--progress=plain', '-t', tag, '-f', str(context / 'Dockerfile'),
                  str(context)], bounded(night, started, phase_end, 2400))
    derived = captured(night, ops, ['docker', 'image', 'inspect', tag])
    ops.write(night.root / 'derived-image.json', derived)
    if derived.get('exitCode') != 0:
        raise RuntimeError('DERIVED_IMAGE_INSPECT_FAILED')
    info = json.loads(derived['stdout'])[0]
    if info.get('Architecture') != 'arm64' or info.get('Os') != 'linux':
        raise RuntimeError('DERIVED_IMAGE_NOT_ARM64')
    after = package_versions(night, ops, tag, 'derived-packages',
                             bounded(night, started, phase_end, 180))
    if any(after['packages'].get(name) != version for name, version in PYTHON_PINS.items()):
        raise RuntimeError('DERIVED_DEPENDENCIES_MISMATCH')
    for key in ('torch', 'flash-attn'):
        if after['packages'].get(key) != before['packages'].get(key):
            raise RuntimeError('TORCH_OR_FLASH_ATTENTION_CHANGED')
    if after['cuda'] != before['cuda']:
        raise RuntimeError('CUDA_CHANGED')
    return tag


def image_preflight(night, args, ops, started, phase_end):
    if not re.fullmatch(r'[^\s]+@sha256:[0-9a-f]{64}', args.image):
        raise RuntimeError('IMAGE_DIGEST_REQUIRED')
    night.command('image-pull', ['docker', 'pull', '--platform', 'linux/arm64', args.image],
                  bounded(night, started, phase_end, 1200))
    image = captured(night, ops, ['docker', 'image', 'inspect', args.image])
    ops.write(night.root / 'image-inspect.json', image)
    if image.get('exitCode') != 0:
        raise RuntimeError('IMAGE_INSPECT_FAILED')
    info = json.loads(image['stdout'])[0]
    requested_digest = args.image.rsplit('@', 1)[1]
    if (info.get('Os') != 'linux' or info.get('Architecture') != 'arm64' or
            not any(value.endswith('@' + requested_digest) for value in info.get('RepoDigests', []))):
        raise RuntimeError('IMAGE_NOT_PINNED_ARM64')
    runtime_image = isolated_dependencies(night, args, ops, started, phase_end)
    resources(night, ops, 'before-cuda-probe', 40 * GIB)
    probe = ("import json,platform,sys,torch,transformers,flash_attn,qwen_vl_utils,decord,"
             "huggingface_hub; reader=decord.VideoReader('/video.mp4',ctx=decord.cpu(0)); "
             "reader[0]; print(json.dumps({'arch':platform.machine(),'videoFrames':len(reader),"
             "'decord':decord.__version__,"
             "'torch':torch.__version__,'cuda':torch.version.cuda,"
             "'available':torch.cuda.is_available(),"
             "'capability':torch.cuda.get_device_capability(0),"
             "'transformers':transformers.__version__,"
             "'flash_attn':flash_attn.__version__})); "
             "sys.path[:0]=['/source/streaming_vlm/livecc_utils/src','/source']; "
             "import streaming_vlm.inference.inference")
    folder = night.container('dependency-probe', ['--device', 'nvidia.com/gpu=all',
                '-e', 'NVIDIA_VISIBLE_DEVICES=void', '--network', 'none',
                '--workdir', '/tmp', '-v', str(args.upstream) + ':/source:ro',
                '-v', str(args.video) + ':/video.mp4:ro', '--entrypoint',
                'python3', runtime_image, '-c', probe], bounded(night, started, phase_end, 300))
    lines = (folder / 'stdout.log').read_text().splitlines()
    data = next(json.loads(line) for line in reversed(lines) if line.startswith('{') and 'capability' in line)
    ops.write(night.root / 'dependency-probe.json', data)
    if (data.get('arch') != 'aarch64' or data.get('available') is not True or
            data.get('capability') != [12, 1] or data.get('videoFrames', 0) < 16):
        raise RuntimeError('GX10_CUDA_INCOMPATIBLE')
    return runtime_image


def download(night, args, ops, image, started, phase_end):
    cache = night.root.parent / ('streaming-hf-' + night.owner)
    cache.mkdir(mode=0o700)
    script = ("from huggingface_hub import snapshot_download; "
              "print(snapshot_download('mit-han-lab/StreamingVLM',"
              "revision='7ac1cef46d20432053a9814838760318cb26b348',"
              "cache_dir='/cache',token=False,max_workers=4),flush=True)")
    night.container('checkpoint-download', ['--network', 'bridge',
        '-e', 'HF_HUB_DISABLE_IMPLICIT_TOKEN=1', '-e', 'HF_HUB_DISABLE_TELEMETRY=1',
        '-v', str(cache) + ':/cache', '--entrypoint', 'python3', image,
        '-c', script], bounded(night, started, phase_end, 3600))
    snapshot = cache / 'models--mit-han-lab--StreamingVLM' / 'snapshots' / REVISION
    if not (snapshot / 'config.json').is_file() or not list(snapshot.glob('*.safetensors')):
        raise RuntimeError('CHECKPOINT_INCOMPLETE')
    files = {}
    for file in sorted(snapshot.rglob('*')):
        if file.is_file():
            night.check()
            files[str(file.relative_to(snapshot))] = {'bytes': file.stat().st_size,
                                                      'sha256': ops.digest(file)}
    ops.write(night.root / 'checkpoint-files.json', {'repo': MODEL, 'revision': REVISION,
              'files': files, 'totalBytes': sum(item['bytes'] for item in files.values())})
    return cache


def pilot(night, args, ops, image, cache, seconds, recompute, started, phase_end, timeout):
    resources(night, ops, 'before-' + str(seconds) + ('-recompute' if recompute else ''), 40 * GIB)
    name = 'pilot-' + str(seconds) + ('-recompute' if recompute else '')
    output = '/results/result-' + name
    wrapper = '/runner/run_streamingvlm.py'
    model = '/cache/models--mit-han-lab--StreamingVLM/snapshots/' + REVISION
    argv = ['--device', 'nvidia.com/gpu=all', '-e', 'NVIDIA_VISIBLE_DEVICES=void',
            '--network', 'none', '--shm-size', '8g', '--memory', '96g', '--memory-swap', '96g',
            '-e', 'HF_HUB_OFFLINE=1', '-e', 'TRANSFORMERS_OFFLINE=1',
            '-v', str(args.upstream) + ':/source:ro', '-v', str(cache) + ':/cache:ro',
            '-v', str(args.video) + ':/video.mp4:ro',
            '-v', str(night.root) + ':/results',
            '-v', str(args.package / 'scripts') + ':/runner:ro',
            '--entrypoint', 'python3', image, wrapper,
            '--source', '/source', '--model', model, '--video', '/video.mp4',
            '--output', output, '--duration', str(seconds), '--execute']
    if recompute:
        argv.append('--recompute')
    night.container(name, argv, bounded(night, started, phase_end, timeout))
    result = ops.read(night.root / ('result-' + name) / 'status.json')
    if result.get('status') != 'finished' or result.get('segmentCount') != seconds:
        raise RuntimeError('PILOT_INCOMPLETE:' + name)
    ops.write(night.root / (name + '-result.json'), {'atUtc': ops.utc(), 'status': result,
        'integritySha256': ops.digest(night.root / ('result-' + name) / 'integrite.json')})


def run(args, ops):
    night = ops.Night(args.out, DEADLINE)
    locks = []
    success = False
    try:
        ops.write(night.root / 'protocol.json', {'deadlineUtc': DEADLINE.isoformat(),
            'wallBudgetSeconds': 12600, 'shortPhaseSeconds': 5400, 'image': args.image,
            'upstreamCommit': UPSTREAM_COMMIT, 'model': MODEL, 'revision': REVISION,
            'videoSha256': VIDEO_SHA256, 'durations': [16, 72, 372],
            'recomputeOnlyAtSeconds': 16, 'readyForScoring': False})
        locks = gate(night, args, ops)
        started = time.monotonic()
        first_end = started + 5400
        final_end = started + 12600
        night.start_monitor()
        verify_source(night, args, ops)
        if ops.digest(args.video) != VIDEO_SHA256:
            raise RuntimeError('VIDEO_IDENTITY_MISMATCH')
        wait_idle(night, ops, min(first_end, night.deadline))
        runtime_image = image_preflight(night, args, ops, started, first_end)
        resources(night, ops, 'before-download', 65 * GIB)
        cache = download(night, args, ops, runtime_image, started, first_end)
        pilot(night, args, ops, runtime_image, cache, 16, False, started, first_end, 900)
        # Chaque préfixe est un essai indépendant : la cadence et le cache sont observés sans parallèle.
        for seconds, timeout in ((72, 1800), (372, 5400)):
            remaining = min(night.deadline, final_end) - time.monotonic()
            if remaining < timeout + 120:
                ops.write(night.root / ('pilot-' + str(seconds) + '-missing.json'),
                          {'reason': 'INSUFFICIENT_TIME', 'remainingSeconds': max(0, remaining)})
                continue
            pilot(night, args, ops, runtime_image, cache, seconds, False, started, final_end, timeout)
        remaining = min(night.deadline, final_end) - time.monotonic()
        if remaining >= 1020:
            pilot(night, args, ops, runtime_image, cache, 16, True, started, final_end, 900)
        else:
            ops.write(night.root / 'pilot-16-recompute-missing.json',
                      {'reason': 'INSUFFICIENT_TIME', 'remainingSeconds': max(0, remaining)})
        night.event('workload-finished', readyForScoring=False)
        success = True
    except Exception as error:
        night.event('blocked', error={'type': type(error).__name__, 'message': str(error)},
                    readyForScoring=False)
    finally:
        try:
            success = night.close() and success
        finally:
            for handle in locks:
                handle.close()
    return 0 if success else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('support', 'package', 'upstream', 'video', 'night-root', 'sidecar-root',
                 'night-lock', 'gpu-lock', 'reference-lock', 'out', 'image'):
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    if platform.system() != 'Linux' or platform.machine() != 'aarch64':
        raise RuntimeError('GX10_LINUX_ARM64_REQUIRED')
    for name in ('support', 'package', 'upstream', 'video', 'night_root', 'sidecar_root',
                 'night_lock', 'gpu_lock', 'reference_lock', 'out'):
        setattr(args, name, Path(getattr(args, name)).resolve())
    sys.path.insert(0, str(args.support))
    import night_common as ops
    return run(args, ops)


if __name__ == '__main__':
    sys.exit(main())
