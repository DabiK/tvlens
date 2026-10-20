"""Vérifie le rejeu réel et conserve une synthèse sans recopier les médias."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent
run = json.loads((root / 'preuve-cnrs.json').read_text())
assert run['complete'] and run['status'] == 'complete'
assert run['stopReason'] == 'drained'
assert not run['guardFailures'] and not run['remaining'] and run.get('error') is None
assert run['shutdown']['archiveConfirmed'] and run['shutdown']['releaseConfirmed']
assert not run['shutdown']['errors']
assert all(value == 0 for value in run['summary']['lossCounters'].values())
assert len(run['uploads']) == 23
assert all(q['status'] == 'done' and q['acquired'] for q in run['questions'])
roles = run['summary']['roles']
assert all(next(r for r in roles if r['role'] == role)['successful']
           for role in ('perception', 'questions', 'embeddings', 'transcription'))
summary = {
    'runId': run['runId'],
    'complete': True,
    'sourceDurationMs': 180000,
    'plannedDurationMs': 190000,
    'uploads': len(run['uploads']),
    'questions': [{
        'id': q['id'], 'question': q['question'], 'kind': q['result']['kind'],
        'answer': q['result']['answer'], 'citations': q['result']['citations'],
        'endToEndMs': q['metrics']['endToEndMs'],
        'evidence': q['metrics']['evidence'],
    } for q in run['questions']],
    'lossCounters': run['summary']['lossCounters'],
    'guardFailures': run['guardFailures'],
    'roles': [{k: r.get(k) for k in ('role', 'configured', 'exercised', 'successful',
                                   'calls', 'localMeasurement', 'indexEvidence')}
              for r in roles],
    'limits': ['Capture TV et transport TV non testés',
               'Téléchargement et encodage Artemis actifs pendant le rejeu',
               'Aucune notation de qualité ; une abstention sur trois questions',
               'Trois indexations encore en attente à la fermeture',
               'Les dix secondes finales sans capture sont prévues par le scénario'],
}
(root / 'synthese-cnrs.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
print('Rejeu complet vérifié ; trois résultats conservés, dont une abstention.')
