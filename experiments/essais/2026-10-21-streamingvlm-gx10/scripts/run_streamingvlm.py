"""Exécuter un préfixe StreamingVLM dans un dossier neuf et borné."""
import argparse
import datetime
import hashlib
import importlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import traceback


UPSTREAM_COMMIT = 'a940d8cbfa14eefe651b7f4adeb81825c28cc6c6'
CHECKPOINT_REVISION = '7ac1cef46d20432053a9814838760318cb26b348'
VIDEO_SHA256 = 'c2c678f2a70338c060b33608bc34d0a1050cd284e249814b3dac0d85eaaa443a'
DURATIONS = (16, 72, 372)
QUERY = 'Describe visible events accurately and avoid unsupported details.'


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write(path, value):
    target = Path(path)
    temporary = target.with_name(target.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(target)


def validate(source, model, video, output, duration, chunk, window, recompute):
    if duration not in DURATIONS or chunk != 1 or window != 16 or window % chunk:
        raise ValueError('PROTOCOL_OUT_OF_BOUNDS')
    if recompute and duration != 16:
        raise ValueError('RECOMPUTE_ONLY_ON_16_SECONDS')
    if output.exists():
        raise FileExistsError('OUTPUT_ALREADY_EXISTS')
    if not source.is_dir() or not (source / 'streaming_vlm/inference/inference.py').is_file():
        raise ValueError('UPSTREAM_SOURCE_MISSING')
    git = ['git', '-c', 'safe.directory=' + str(source), '-C', str(source)]
    commit = subprocess.run(git + ['rev-parse', 'HEAD'], capture_output=True,
                            text=True, check=True).stdout.strip()
    dirty = subprocess.run(git + ['status', '--porcelain', '--',
                            'streaming_vlm', 'infer_requirements.txt', 'scripts/env_infer.sh'],
                           capture_output=True, text=True, check=True).stdout.strip()
    if commit != UPSTREAM_COMMIT or dirty:
        raise ValueError('UPSTREAM_IDENTITY_MISMATCH')
    if not model.is_dir() or model.name != CHECKPOINT_REVISION or not (model / 'config.json').is_file():
        raise ValueError('CHECKPOINT_REVISION_OR_CONFIG_MISSING')
    if not list(model.glob('*.safetensors')):
        raise ValueError('CHECKPOINT_WEIGHTS_MISSING')
    if not video.is_file() or digest(video) != VIDEO_SHA256:
        raise ValueError('VIDEO_IDENTITY_MISMATCH')
    return commit


def run(args):
    source, model, video, output = (Path(value).resolve() for value in
                                    [args.source, args.model, args.video, args.output])
    commit = validate(source, model, video, output, args.duration, args.chunk_duration,
                      args.window_size, args.recompute)
    if not args.execute:
        print(json.dumps({'validated': True, 'durationSeconds': args.duration,
                          'upstreamCommit': commit, 'checkpointRevision': CHECKPOINT_REVISION}))
        return 0
    output.mkdir(mode=0o700)
    protocol = {'startedAtUtc': utc(), 'source': str(source), 'upstreamCommit': commit,
                'model': str(model), 'checkpointRevision': CHECKPOINT_REVISION,
                'video': str(video), 'videoSha256': VIDEO_SHA256,
                'durationSeconds': args.duration, 'chunkDurationSeconds': args.chunk_duration,
                'windowSizeSeconds': args.window_size, 'recompute': args.recompute,
                'query': QUERY, 'seed': 42, 'temperature': 0.9,
                'textRound': 16, 'textSink': None, 'textSlidingWindow': None}
    write(output / 'protocol.json', protocol)
    started = time.monotonic()
    status = {'status': 'running', 'startedAtUtc': utc()}
    write(output / 'status.json', status)
    try:
        # Le code amont crée ./output_image à l'import ; le cwd est donc privé.
        os.chdir(output)
        os.environ['PYTHONBREAKPOINT'] = '0'
        os.environ['HF_HUB_OFFLINE'] = '1'
        os.environ['TRANSFORMERS_OFFLINE'] = '1'
        sys.path.insert(0, str(source))
        sys.path.insert(0, str(source / 'streaming_vlm/livecc_utils/src'))
        upstream = importlib.import_module('streaming_vlm.inference.inference')
        timing = upstream.streaming_inference(
            model_path=str(model), video_path=str(video), output_dir=str(output / 'segments.vtt'),
            model_base='Qwen2_5', window_size=args.window_size,
            chunk_duration=args.chunk_duration, text_round=16, previous_text='',
            pos_mode='shrink', text_sink=None, text_sliding_window=None,
            duration=args.duration, query=QUERY, recompute=args.recompute,
            temperature=0.9, repetition_penalty=1.05, quiet=False,
            emit_json=True, time_test=True)
        if not isinstance(timing, list) or len(timing) != args.duration:
            raise RuntimeError('INCOMPLETE_SEGMENTS')
        if not (output / 'segments.vtt').is_file():
            raise RuntimeError('SUBTITLES_MISSING')
        write(output / 'timing.json', timing)
        status.update(status='finished', segmentCount=len(timing))
        return 0
    except BaseException as error:
        status.update(status='failed', error={'type': type(error).__name__,
                                             'message': str(error), 'traceback': traceback.format_exc()})
        return 1
    finally:
        status.update(finishedAtUtc=utc(), wallSeconds=time.monotonic() - started)
        write(output / 'status.json', status)
        write(output / 'integrite.json', {'files': {str(p.relative_to(output)): digest(p)
              for p in sorted(output.rglob('*')) if p.is_file() and p.name != 'integrite.json'}})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('source', 'model', 'video', 'output'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--duration', type=int, choices=DURATIONS, required=True)
    parser.add_argument('--chunk-duration', type=int, default=1)
    parser.add_argument('--window-size', type=int, default=16)
    parser.add_argument('--recompute', action='store_true')
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    try:
        return run(args)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'{type(error).__name__}: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
