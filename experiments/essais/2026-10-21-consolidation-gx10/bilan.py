"""Bilan descriptif des confirmations GX10, sans notation de pertinence."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import sys


HERE = Path(__file__).resolve().parent
ESSAIS = HERE.parent
PAUSE_REFERENCE = ESSAIS / '2026-10-21-confirmation-pause-vision-gx10' / 'reference'
IMAGE_SELECTION = ESSAIS / '2026-10-21-confirmation-images-gx10' / 'inputs.json'
RUN_PATTERN = re.compile(r'^(kennedy|spring)-(0[1-4])-([AB])$')
IMAGE_RUN_PATTERN = re.compile(r'^run-(0[1-4])-([AB])$')
ORDER = {'01': ('A', 1), '02': ('B', 1), '03': ('B', 2), '04': ('A', 2)}
PROVIDER_FIELDS = {
    'fournisseurTotalMs': 'totalMs', 'fournisseurChargementMs': 'loadMs',
    'fournisseurPrefillMs': 'promptEvalMs', 'fournisseurGenerationMs': 'evalMs',
    'jetonsEntree': 'promptTokens', 'jetonsSortie': 'evalTokens',
}
CLIENT_FIELDS = {'clientRequeteMs': 'requestMs', 'clientFileMs': 'queueMs'}
METRICS = (*PROVIDER_FIELDS, *CLIENT_FIELDS, 'clientFilePlusRequeteMs')
THRESHOLDS_MS = {'sous15': 15000, 'sous20': 20000}


def read(path):
    return json.loads(Path(path).read_text())


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def number(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
        return value
    return None


def percentile(values, fraction):
    ordered = sorted(value for value in values if number(value) is not None)
    if not ordered:
        return None
    position = (len(ordered) - 1) * fraction
    low = math.floor(position)
    high = math.ceil(position)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def distribution(values):
    observed = [value for value in values if number(value) is not None]
    return {'n': len(observed), 'p50': percentile(observed, 0.5), 'p95': percentile(observed, 0.95)}


def run_identity(path):
    match = RUN_PATTERN.fullmatch(Path(path).parent.parent.name)
    if not match:
        raise ValueError('Nom de passage inattendu : ' + str(path))
    video, order, arm = match.groups()
    if arm != ORDER[order][0]:
        raise ValueError('Ordre ou bras inattendu : ' + str(path))
    return video, arm, ORDER[order][1], order


def planned_questions(video):
    rows = read(PAUSE_REFERENCE / (video + '.json'))['questions']
    ids = [row['id'] for row in rows]
    if len(ids) != 5 or len(ids) != len(set(ids)):
        raise ValueError('Référence de questions invalide : ' + video)
    return ids


def question_row(question):
    latency = question.get('latency') or {}
    evidence = (latency.get('internal') or {}).get('evidence') or {}
    anchor = number(evidence.get('anchorMs'))
    analyzed = number(evidence.get('analyzedThroughMs'))
    context = number(evidence.get('contextThroughMs'))
    acquired = question.get('acquired') is True and question.get('status') == 'done'
    delay = number(latency.get('submissionToHttpResponseMs')) if acquired else None
    return {
        'id': question['id'], 'status': question.get('status'), 'acquis': acquired,
        'typeReponse': (question.get('result') or {}).get('kind') if acquired else None,
        'delaiHttpMs': delay,
        'preuve': {
            'ageAnalyseMs': anchor - analyzed if anchor is not None and analyzed is not None else None,
            'ageContexteMs': anchor - context if anchor is not None and context is not None else None,
            'retardInitialMs': number(evidence.get('lagAtStartMs')),
            'queueNonAnalyseeMs': number(evidence.get('unanalyzedTailMs')),
            'enAttente': evidence.get('pendingCount'), 'partiels': evidence.get('partialCount'),
            'entreesPerdues': evidence.get('journalDropped'),
        },
    }


def question_summary(rows, planned):
    delays = [row['delaiHttpMs'] for row in rows if row['delaiHttpMs'] is not None]
    ages = [row['preuve']['ageAnalyseMs'] for row in rows]
    acquired = sum(row['acquis'] for row in rows)
    return {
        'planifie': planned, 'observe': len(rows), 'acquis': acquired,
        'nonAcquis': planned - acquired,
        'insufficient': sum(row.get('typeReponse') == 'insufficient' for row in rows),
        'delaiHttpMs': distribution(delays),
        'agePreuveAnalyseMs': distribution(ages),
        'sous15': {'nombre': sum(value < THRESHOLDS_MS['sous15'] for value in delays),
                   'denominateur': planned},
        'sous20': {'nombre': sum(value < THRESHOLDS_MS['sous20'] for value in delays),
                   'denominateur': planned},
    }


def pause_run(path):
    video, arm, passage, order = run_identity(path)
    report = read(path)
    if report.get('mode') != 'execution':
        raise ValueError('Campagne hors exécution : ' + str(path))
    expected = planned_questions(video)
    questions = report.get('questions') or []
    ids = [row.get('id') for row in questions]
    if len(ids) != len(set(ids)) or any(item not in expected for item in ids):
        raise ValueError('Questions absentes de la référence ou dupliquées : ' + str(path))
    by_id = {row['id']: question_row(row) for row in questions}
    rows = [by_id.get(identifier, {'id': identifier, 'status': 'absent', 'acquis': False,
                                    'delaiHttpMs': None, 'preuve': {}}) for identifier in expected]
    summary = report.get('summary') or {}
    return {
        'video': video, 'bras': arm, 'passage': passage, 'ordre': order,
        'source': str(Path(path).resolve()), 'sha256': sha256(path), 'runId': report.get('runId'),
        'complete': report.get('complete') is True and report.get('status') == 'complete',
        'questions': rows, 'mesures': question_summary(rows, len(expected)),
        'couverture': (summary.get('coverage') or {}),
        'pertesParCause': {name: (item or {}).get('byCause', {})
                           for name, item in (summary.get('losses') or {}).items()},
        'compteursPertes': summary.get('lossCounters') or {},
    }


def pause_pairs(runs):
    pairs = []
    grouped = {(run['video'], run['bras'], run['passage']): run for run in runs}
    for video in ('kennedy', 'spring'):
        for passage in (1, 2):
            a = grouped.get((video, 'A', passage))
            b = grouped.get((video, 'B', passage))
            if not a or not b:
                continue
            right = {row['id']: row for row in b['questions']}
            for left in a['questions']:
                other = right[left['id']]
                x, y = left['delaiHttpMs'], other['delaiHttpMs']
                pairs.append({'video': video, 'passage': passage, 'id': left['id'],
                              'Ams': x, 'Bms': y, 'differenceBmoinsAMs': y - x if x is not None and y is not None else None,
                              'acquisA': left['acquis'], 'acquisB': other['acquis']})
    return pairs


def pause_report(paths):
    runs = [pause_run(path) for path in paths]
    keys = [(run['video'], run['bras'], run['passage']) for run in runs]
    if len(keys) != len(set(keys)):
        raise ValueError('Passage pause dupliqué')
    runs.sort(key=lambda row: (row['video'], row['ordre']))
    pairs = pause_pairs(runs)
    aggregates = []
    for video in ('kennedy', 'spring'):
        for arm in ('A', 'B'):
            subset = [run for run in runs if run['video'] == video and run['bras'] == arm]
            rows = [question for run in subset for question in run['questions']]
            if subset:
                aggregates.append({'video': video, 'bras': arm, 'passages': len(subset),
                                   'mesures': question_summary(rows, 5 * len(subset))})
    return {'etat': 'complet' if len(runs) == 8 and all(row['complete'] for row in runs) else 'partiel',
            'passages': runs, 'parVideoEtBras': aggregates, 'appariements': pairs,
            'differencesApparieesMs': [
                {'video': video, 'passage': passage,
                 **distribution([row['differenceBmoinsAMs'] for row in pairs
                                 if row['video'] == video and row['passage'] == passage])}
                for video in ('kennedy', 'spring') for passage in (1, 2)]}


def image_row(row):
    timings = row.get('providerTimings') or []
    client = row.get('clientTimings') or []
    status = row.get('status')
    values = {}
    for name, field in PROVIDER_FIELDS.items():
        values[name] = sum_field(timings, field)
    for name, field in CLIENT_FIELDS.items():
        values[name] = sum_field(client, field)
    request, queue = values['clientRequeteMs'], values['clientFileMs']
    values['clientFilePlusRequeteMs'] = request + queue if request is not None and queue is not None else None
    return {'id': row['id'], 'status': status, 'appelsFournisseur': len(timings),
            'mesures': values if status == 'succeeded' else {metric: None for metric in METRICS}}


def sum_field(rows, field):
    present = [number(item.get(field)) for item in rows]
    return sum(present) if present and all(value is not None for value in present) else None


def image_report(path):
    data = read(path)
    selection = read(IMAGE_SELECTION)
    expected = {video: {video + '-' + case['id'] for case in spec['cases']}
                for video, spec in selection['videos'].items()}
    groups = {}
    seen = set()
    for row in data.get('rows') or []:
        match = IMAGE_RUN_PATTERN.fullmatch(row.get('run', ''))
        if not match:
            raise ValueError('Passage images inattendu : ' + str(row.get('run')))
        order, arm = match.groups()
        if arm != ORDER[order][0] or row.get('arm') != arm:
            raise ValueError('Bras images incohérent : ' + str(row))
        video = row['id'].split('-', 1)[0]
        if video not in expected or row['id'] not in expected[video]:
            raise ValueError('Bloc images inattendu : ' + row['id'])
        key = (video, arm, ORDER[order][1])
        identity = (*key, row['id'])
        if identity in seen:
            raise ValueError('Bloc images dupliqué : ' + row['id'])
        seen.add(identity)
        groups.setdefault(key, []).append(image_row(row))
    runs = []
    for key, rows in sorted(groups.items()):
        video, arm, passage = key
        runs.append({'video': video, 'bras': arm, 'passage': passage,
                     'planifie': len(expected[video]), 'observe': len(rows),
                     'reussi': sum(row['status'] == 'succeeded' for row in rows),
                     'parMesure': {metric: distribution([row['mesures'][metric] for row in rows]) for metric in METRICS},
                     'blocs': sorted(rows, key=lambda row: row['id'])})
    lookup = {(run['video'], run['bras'], run['passage']): run for run in runs}
    pairs = []
    for video in expected:
        for passage in (1, 2):
            a, b = lookup.get((video, 'A', passage)), lookup.get((video, 'B', passage))
            if not a or not b:
                continue
            left = {row['id']: row for row in a['blocs']}
            right = {row['id']: row for row in b['blocs']}
            for identifier in sorted(expected[video]):
                x, y = left.get(identifier), right.get(identifier)
                pairs.append({'video': video, 'passage': passage, 'id': identifier,
                              'difference3moins5': {
                                  metric: y['mesures'][metric] - x['mesures'][metric]
                                  if x and y and x['mesures'][metric] is not None and y['mesures'][metric] is not None else None
                                  for metric in METRICS}})
    cadence = []
    for row in data.get('cadence') or []:
        match = IMAGE_RUN_PATTERN.fullmatch(row.get('run', ''))
        if not match or row.get('arm') != match.group(2) or match.group(2) != ORDER[match.group(1)][0]:
            raise ValueError('Cadence de passage images incohérente : ' + str(row))
        cadence.append({'passage': ORDER[match.group(1)][1], 'bras': match.group(2),
                        'ordre': match.group(1), 'cas': row.get('cases'),
                        'dureeSecondes': number(row.get('durationSeconds')),
                        'casParSeconde': number(row.get('casesPerSecond'))})
    return {'etat': 'complet' if len(runs) == 8 and all(run['reussi'] == run['planifie'] for run in runs) else 'partiel',
            'source': str(Path(path).resolve()), 'sha256': sha256(path), 'passages': runs,
            'cadenceParPassage': sorted(cadence, key=lambda row: row['ordre']),
            'appariementsParBloc': pairs,
            'resumeApparie': [
                {'video': video, 'passage': passage,
                 'parMesure': {metric: distribution([row['difference3moins5'][metric] for row in pairs
                                                     if row['video'] == video and row['passage'] == passage])
                              for metric in METRICS}}
                for video in expected for passage in (1, 2)]}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--campaign', action='append', type=Path, required=True,
                        help='Un campaign.json pause par passage (répéter huit fois).')
    parser.add_argument('--images', type=Path, help='mesures.json de la confirmation images, dès disponibilité.')
    parser.add_argument('--out', type=Path, help='Fichier JSON de sortie ; stdout par défaut.')
    args = parser.parse_args(argv)
    result = {'version': 1, 'readyForScoring': False,
              'methode': {'percentile': 'interpolation linéaire, rang (n-1)*p',
                          'seuils': 'strictement inférieurs, dénominateur planifié',
                          'differences': 'B-A pour la pause ; 3 images - 5 images pour les blocs',
                          'images': 'clientRequeteMs est distinct de fournisseurTotalMs ; clientFilePlusRequeteMs additionne file et requête'},
              'pauseVision': pause_report(args.campaign),
              'images': image_report(args.images) if args.images else {'etat': 'en_attente'}}
    output = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.out:
        args.out.write_text(output)
    else:
        sys.stdout.write(output)
    return 0


if __name__ == '__main__':
    sys.exit(main())
