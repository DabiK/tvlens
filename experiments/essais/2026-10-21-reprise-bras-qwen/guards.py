"""Gardes du suffixe expérimental : identité, clôture et exclusion GPU."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import tarfile

BASE = Path('/home/nvidia/tvlens-setup')
ORIGINAL = BASE / 'reprise-qwen-20261020T224923Z/results'
CORPUS = BASE / 'reprise-corpus-20261020T224923Z/results'
NIGHT = BASE / 'reprise-night-20261020T224805Z/results'
STREAMING = BASE / 'reprise-streaming-20261020T224923Z/results'
ORIGINAL_SEAL = '17660b79ce96c940ca1c5412ceb2fdcd23851824a3566d07871f8df12b63b026'
STREAMING_SEAL = '1525213d99f3eb2e28d172ad3d3e7a80e2deb30254a82a1921020856719edeaa'
MODEL = 'qwen3-vl:4b-instruct-bf16'
DIGEST = '1d2c81ea69a06341d1aaa9e4fbd655402681057c291754008f44fa6e74acc298'
MANIFEST_SHA = '86d4524753f112422a4409c034f1d1e47721920b466c433849d190531d6bd659'
MISSING_REASON = 'NO_ONE_HOUR_SLOT_BEFORE_ORIGINAL_DEADLINE'
MODULES = {
    'ops': (BASE / 'nuit-20261020T210107Z/package/scripts/night_common.py',
            'e6bec0c7415c67ed1e4901e784a6ee33e6dd58b684bca46dc4ce7804dd30d6b5'),
    'vision': (BASE / 'vision-vllm-20261020T214231Z/package/queue.py',
               '485931ad6f4107c2f3a66f582edd7b31b74b4a59f2f0ee7f399a26f9a370d6cf'),
    'streaming': (BASE / 'streamingvlm-20261020T220235Z/package/scripts/queue.py',
                  '56f40fad2792ba4a0b118ab1be07518ce03670d0e945af6cf8f134b5c5a751f5'),
    'corpus': (BASE / 'corpus-etendu-20261020T221045Z/package/scripts/queue.py',
               'e7f94c03857af00b4d477cb26805702de2fd6158baba7b62f8e86d6836d9414a'),
}


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def normalized_digest(value):
    if not isinstance(value, str) or not re.fullmatch(r'(?:sha256:)?[0-9a-f]{64}', value):
        raise RuntimeError('DIGEST_FORMAT_INVALID')
    return value.removeprefix('sha256:')


def load(name):
    path, expected = MODULES[name]
    if digest(path) != expected:
        raise RuntimeError('FROZEN_MODULE_CHANGED:' + name)
    spec = importlib.util.spec_from_file_location('frozen_' + name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def verify_streaming_package():
    source = BASE / 'streamingvlm-20261020T220235Z'
    archive = source / 'package.tar.gz'
    if digest(archive) != 'c1fa9b1eb71b0051caf80338d74c5007034ec7f9ca075c095c4c6410b2d29115':
        raise RuntimeError('STREAMING_PACKAGE_CHANGED')
    if digest(source / 'upstream.tar.gz') != 'b06647955747616ff91c8be46413bb20971f65a834ed76bdf481e266f4c39d1a':
        raise RuntimeError('STREAMING_UPSTREAM_ARCHIVE_CHANGED')
    package = source / 'package'
    with tarfile.open(archive, 'r:gz') as handle:
        for member in handle:
            if not member.isfile():
                continue
            path = package / member.name
            if (not path.resolve().is_relative_to(package.resolve()) or path.is_symlink()
                    or digest(path) != hashlib.sha256(handle.extractfile(member).read()).hexdigest()):
                raise RuntimeError('STREAMING_PACKAGE_CONTENT_CHANGED')


def sealed(root, expected_seal=None, complete=True):
    seal_path = root / 'integrite.json'
    if expected_seal and digest(seal_path) != expected_seal:
        raise RuntimeError('SEAL_IDENTITY_CHANGED')
    files = read(seal_path)['files']
    required = files if complete else ('status.json', 'events.jsonl')
    for name in required:
        path = root / name
        if (not path.resolve().is_relative_to(root.resolve()) or path.is_symlink()
                or not path.is_file() or digest(path) != files.get(name)):
            raise RuntimeError('SEALED_FILE_CHANGED:' + name)
    return files


def terminal(root):
    if not all((root / name).is_file() for name in ('status.json', 'integrite.json', 'events.jsonl')):
        return None
    state = read(root / 'status.json')
    if state.get('status') not in ('finished', 'blocked', 'cleanup-failed'):
        return None
    sealed(root, complete=False)
    events = (root / 'events.jsonl').read_text().splitlines()
    if not events or json.loads(events[-1]).get('status') != state['status']:
        raise RuntimeError('TERMINAL_EVENT_MISMATCH')
    if state['status'] == 'cleanup-failed' or state.get('cleanupConfirmed') is False:
        raise RuntimeError('PREDECESSOR_CLEANUP_FAILED')
    if state['status'] == 'finished' and state.get('cleanupConfirmed') is not True:
        raise RuntimeError('PREDECESSOR_CLEANUP_UNKNOWN')
    return state


def verify_cases(root, backend, model):
    for phase, count in (('preflight', 1), ('full', 24)):
        folder = root / (backend + '-' + phase)
        files = sealed(folder)
        report = read(folder / 'campaign.json')
        rows = report.get('cases', [])
        if (report.get('complete') is not True or report.get('backend') != backend
                or report.get('model') != model or report.get('mode') != 'execute'
                or report.get('manifestSha256') != MANIFEST_SHA or len(rows) != count):
            raise RuntimeError('CAMPAIGN_INCOMPLETE_OR_CHANGED')
        for row in rows:
            if row.get('status') != 'returned' or len(row.get('frameSha256', [])) != 5:
                raise RuntimeError('CASE_NOT_RETURNED_OR_NOT_FIVE_IMAGES')
            for kind in ('request', 'response'):
                if not row.get(kind + 'File') or files.get(row[kind + 'File']) != row.get(kind + 'Sha256'):
                    raise RuntimeError('CASE_BYTES_NOT_VERIFIED')


def verify_original(root=ORIGINAL):
    sealed(root, ORIGINAL_SEAL)
    state = terminal(root)
    if state['status'] != 'blocked' or state.get('error', {}).get('message') != 'OLLAMA_DIGEST_MISMATCH':
        raise RuntimeError('ORIGINAL_FAILURE_NOT_DIGEST_FORMAT')
    protocol = read(root / 'protocol.json')
    tags = read(root / 'ollama-tags-after.json')
    matches = [row for row in tags['models'] if row.get('name') == MODEL]
    if len(matches) != 1 or normalized_digest(matches[0].get('digest')) != DIGEST:
        raise RuntimeError('ORIGINAL_MODEL_IDENTITY_CHANGED')
    if normalized_digest(protocol['ollamaDigest']) != DIGEST or protocol['manifestSha256'] != MANIFEST_SHA:
        raise RuntimeError('ORIGINAL_PROTOCOL_CHANGED')
    if any(stage['name'].startswith('ollama-') and stage['name'] != 'ollama-pull' for stage in state['stages']):
        raise RuntimeError('OLLAMA_ALREADY_ATTEMPTED')
    verify_cases(root, 'vllm', 'Qwen/Qwen3-VL-4B-Instruct')
    return {'root': str(root), 'sealSha256': digest(root / 'integrite.json'),
            'statusSha256': digest(root / 'status.json'), 'vllmReturnedCases': 25,
            'expectedDigest': protocol['ollamaDigest'], 'actualDigest': matches[0]['digest'],
            'ollamaQuantizationMetadata': matches[0].get('details', {}).get('quantization_level')}


def verify_suffix(root):
    state = terminal(root)
    if state is None:
        return None
    sealed(root)
    if state['status'] != 'finished' or state.get('error'):
        raise RuntimeError('SUFFIX_FAILED')
    provenance = read(root / 'continuation.json')
    if (provenance.get('original', {}).get('sealSha256') != ORIGINAL_SEAL
            or provenance.get('corpusRoot') != str(CORPUS)):
        raise RuntimeError('SUFFIX_PROVENANCE_CHANGED')
    if state.get('ollamaArm') == 'complete':
        verify_cases(root, 'ollama', MODEL)
    elif state.get('ollamaArm') == 'missing':
        missing = read(root / 'ollama-missing.json')
        if (missing.get('reason') != MISSING_REASON or state.get('stages')
                or missing.get('attempted') is not False
                or missing.get('remainingSeconds', 3600) >= 3600):
            raise RuntimeError('SUFFIX_MISSING_CAUSE_NOT_ALLOWED')
    else:
        raise RuntimeError('SUFFIX_ARM_UNKNOWN')
    return state
