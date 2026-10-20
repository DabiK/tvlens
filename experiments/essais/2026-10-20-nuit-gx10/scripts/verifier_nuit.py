"""Exercice sans réseau ni modèle des gardes et des traces de la nuit."""
import datetime
import json
import sys
from pathlib import Path
sys.dont_write_bytecode = True
from night import validate_batch
from night_common import Night, digest, read, write
import night_common


def expect_failure(action, expected):
    try:
        action()
    except RuntimeError as error:
        assert expected in str(error), str(error)
    else:
        raise AssertionError('Échec attendu absent : ' + expected)


root = Path(sys.argv[1]).resolve()
root.mkdir()
batch = root / 'batch-fixture'
batch.mkdir()
names = [m + '-' + v for m in ['base', 'small', 'large-v3-turbo'] for v in ['cnrs-apprentissage', 'kennedy', 'spring']]
(batch / 'index.log').write_text(''.join('2026-10-20T00:00:00Z ' + name + ' 0\n' for name in names))
for name in names:
    folder = batch / name
    (folder / 'run').mkdir(parents=True)
    (folder / 'code-sortie.txt').write_text('0\n')
    write(folder / 'run/campaign.json', {'complete': True, 'status': 'complete', 'remaining': [], 'guardFailures': [],
          'shutdown': {'archiveConfirmed': True, 'releaseConfirmed': True, 'errors': []},
          'questions': [{'status': 'done', 'result': {'status': 'insufficient'}} for _ in range(5)]})
assert validate_batch(batch)['readyForScoring'] is False
bad = batch / names[-1] / 'run/campaign.json'
report = read(bad)
report['shutdown']['releaseConfirmed'] = False
write(bad, report)
expect_failure(lambda: validate_batch(batch), 'BATCH_NOT_RELEASED')
night = Night(root / 'execution-fixture', datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=60))
night.command('success', [sys.executable, '-c', 'print("fixture")'], 5)
expect_failure(lambda: night.command('exit-error', [sys.executable, '-c', 'raise SystemExit(7)'], 5), 'EXIT_7')
expect_failure(lambda: night.command('timeout', [sys.executable, '-c', 'import time; time.sleep(10)'], 0.1), 'STAGE_DEADLINE')
night.event('fixture-finished')
night.close()
for name, expected in read(night.root / 'integrite.json')['files'].items():
    assert digest(night.root / name) == expected
cleanup = Night(root / 'cleanup-fixture', datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=60))
cidfile = cleanup.root / 'owned.cid'
cidfile.write_text('a' * 64)
calls = []
def foreign_container(argv, timeout=5):
    calls.append(argv)
    return {'exitCode': 0, 'stdout': json.dumps([{'Id': 'a' * 64, 'Config': {'Labels': {'tvlens.owner': 'someone-else'}}}])}
original = night_common.capture
night_common.capture = foreign_container
assert cleanup.stop_container(cidfile) is False
assert all(call[1] == 'inspect' for call in calls)
calls.clear()
def owned_container(argv, timeout=5):
    calls.append(argv)
    if argv[1] == 'inspect' and '--format' not in argv:
        return {'exitCode': 0, 'stdout': json.dumps([{'Id': 'a' * 64, 'Config': {'Labels': {'tvlens.owner': cleanup.owner}},
                                                    'State': {'Running': True}}])}
    if '--format' in argv:
        return {'exitCode': 0, 'stdout': 'false' if any(c[1] == 'kill' for c in calls) else 'true'}
    return {'exitCode': 1 if argv[1] == 'stop' else 0, 'stdout': ''}
night_common.capture = owned_container
assert cleanup.stop_container(cidfile) is True
assert any(call[1] == 'kill' for call in calls)
night_common.capture = original
cleanup.close()
write(root / 'verification.json', {'fixtureOnly': True, 'passed': True,
      'checks': ['complete-with-abstention', 'release-guard', 'exit-success', 'exit-failure', 'timeout', 'integrity',
                 'foreign-container-untouched', 'owned-container-stop-escalation']})
print(json.dumps({'passed': True, 'out': str(root)}))
