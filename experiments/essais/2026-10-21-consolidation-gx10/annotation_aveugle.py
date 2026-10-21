"""Prépare des annotations aveugles reproductibles à partir des deux confirmations closes."""

import argparse
import hashlib
import json
from pathlib import Path
import random
import re


ROOT = Path(__file__).resolve().parent
PAUSE_RESULTS = (ROOT.parent / '2026-10-21-confirmation-pause-vision-gx10' /
                 'rapatriements/confirmation-pause-20261021T081500Z/results')
IMAGE_RESULTS = (ROOT.parent / '2026-10-21-confirmation-images-gx10' /
                 'rapatriements/confirmation-images-20261021T082000Z/results')
ORDER = {'01': ('A', 1), '02': ('B', 1), '03': ('B', 2), '04': ('A', 2)}
OBSERVATION_FIELDS = ('topic', 'topicContinuity', 'summary', 'visual', 'transcript', 'audio', 'uncertainty')
MEDIA_PATTERN = re.compile(r'data:(?:image|audio|video)/|[A-Za-z0-9+/]{512,}={0,2}')


def read_json(path):
    raw = path.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def require_text(value):
    if not isinstance(value, str) or MEDIA_PATTERN.search(value):
        raise ValueError('Texte manquant ou média encodé dans une sortie')
    return value


def shuffled(items, group):
    items = list(items)
    seed = int(hashlib.sha256(('annotation-aveugle-v1:' + group).encode()).hexdigest(), 16)
    random.Random(seed).shuffle(items)
    return items


def parse_run(name, prefix):
    match = re.fullmatch(rf'{prefix}-(0[1-4])-([AB])', name)
    if not match:
        raise ValueError(f'Nom de passage inattendu : {name}')
    order, arm = match.groups()
    if ORDER[order][0] != arm:
        raise ValueError(f'Ordre A/B/B/A incohérent : {name}')
    return arm, ORDER[order][1]


def pause_packets(paths):
    if len(paths) != 8:
        raise ValueError('Huit campagnes pause sont requises')
    groups = {}
    seen_runs = set()
    for path in paths:
        video, _, _ = path.parent.parent.name.partition('-')
        arm, passage = parse_run(path.parent.parent.name, video)
        if video not in ('kennedy', 'spring') or (video, arm, passage) in seen_runs:
            raise ValueError('Campagnes pause manquantes ou répétées')
        seen_runs.add((video, arm, passage))
        campaign, digest = read_json(path)
        if not campaign.get('complete') or campaign.get('status') != 'complete':
            raise ValueError(f'Campagne incomplète : {path}')
        for question in campaign['questions']:
            if question.get('status') != 'done' or not question.get('acquired'):
                raise ValueError(f'Question non acquise : {path}')
            identifier = question['id']
            groups.setdefault(identifier, []).append({
                'question': require_text(question['question']),
                'answer': require_text(question['result']['answer']),
                'source': str(path.relative_to(ROOT.parent.parent.parent)),
                'sourceSha256': digest,
                'arm': arm,
                'passage': passage,
                'delayMs': question['latency']['submissionToHttpResponseMs'],
                'sourceRecordId': identifier,
            })
    if len(groups) != 10 or any(len(rows) != 4 for rows in groups.values()):
        raise ValueError('Dix questions appariées sur quatre passages sont requises')
    packet = {'version': 1, 'readyForScoring': False, 'expectedAnswersIncluded': False, 'questions': []}
    mapping = {'version': 1, 'readyForScoring': False, 'rows': []}
    for identifier, rows in sorted(groups.items()):
        if len({row['question'] for row in rows}) != 1:
            raise ValueError(f'Libellé divergent : {identifier}')
        question_id = f'Q{len(packet["questions"]) + 1:02d}'
        answers = []
        for position, row in enumerate(shuffled(rows, identifier), 1):
            answer_id = f'{question_id}-R{position}'
            answers.append({'id': answer_id, 'texte': row['answer'], 'note0a3': None,
                            'invention': None, 'preuve': None, 'justification': None})
            mapping['rows'].append({'id': answer_id, **{key: row[key] for key in (
                'source', 'sourceSha256', 'sourceRecordId', 'arm', 'passage', 'delayMs')}})
        packet['questions'].append({'id': question_id, 'question': rows[0]['question'], 'reponses': answers})
    return packet, mapping


def image_packets(annotation_path, measures_path):
    annotation, annotation_digest = read_json(annotation_path)
    measures, measures_digest = read_json(measures_path)
    if annotation.get('readyForScoring') is not False or measures.get('readyForScoring') is not False:
        raise ValueError('Les sources doivent rester non notées')
    measured = {(row['run'], row['id']): row for row in measures['rows']}
    if len(measured) != 96 or len(annotation['rows']) != 96:
        raise ValueError('96 observations et mesures appariées sont requises')
    groups = {}
    for row in annotation['rows']:
        arm, passage = parse_run(row['run'], 'run')
        key = (row['run'], row['id'])
        measure = measured[key]
        if row['arm'] != arm or measure['arm'] != arm or row['status'] != 'succeeded':
            raise ValueError(f'Observation ou mesure incohérente : {key}')
        result = row['result']
        observation = result['observation']
        if not isinstance(observation, dict):
            raise ValueError(f'Observation mal formée : {key}')
        content = {'sujet': require_text(result['topicSummary']), 'observation': {
            field: require_text(observation[field]) for field in OBSERVATION_FIELDS}}
        delays = measure['clientTimings']
        if len(delays) != 1 or not isinstance(delays[0].get('requestMs'), (int, float)):
            raise ValueError(f'Délai client ambigu : {key}')
        groups.setdefault(row['id'], []).append({
            'content': content,
            'source': str(annotation_path.relative_to(ROOT.parent.parent.parent)),
            'sourceSha256': annotation_digest,
            'measureSource': str(measures_path.relative_to(ROOT.parent.parent.parent)),
            'measureSha256': measures_digest,
            'sourceRecordId': row['id'],
            'run': row['run'],
            'arm': arm,
            'passage': passage,
            'delayMs': delays[0]['requestMs'],
        })
    if len(groups) != 24 or any(len(rows) != 4 or len({row['run'] for row in rows}) != 4
                                for rows in groups.values()):
        raise ValueError('24 blocs appariés sur quatre passages sont requis')
    packet = {'version': 1, 'readyForScoring': False, 'expectedAnswersIncluded': False, 'blocs': []}
    mapping = {'version': 1, 'readyForScoring': False, 'rows': []}
    for _, rows in sorted(groups.items()):
        block_id = f'B{len(packet["blocs"]) + 1:02d}'
        outputs = []
        for position, row in enumerate(shuffled(rows, rows[0]['sourceRecordId']), 1):
            output_id = f'{block_id}-R{position}'
            outputs.append({'id': output_id, **row['content'], 'ocr': None, 'actionBreve': None,
                            'faitsUtiles': None, 'invention': None})
            mapping['rows'].append({'id': output_id, **{key: row[key] for key in (
                'source', 'sourceSha256', 'measureSource', 'measureSha256', 'sourceRecordId',
                'run', 'arm', 'passage', 'delayMs')}})
        packet['blocs'].append({'id': block_id, 'sorties': outputs})
    return packet, mapping


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pause-results', type=Path, default=PAUSE_RESULTS)
    parser.add_argument('--image-results', type=Path, default=IMAGE_RESULTS)
    parser.add_argument('--out', type=Path, default=ROOT / 'annotation')
    args = parser.parse_args(argv)
    paths = sorted(args.pause_results.glob('*/run/campaign.json'))
    pause, pause_map = pause_packets(paths)
    images, image_map = image_packets(args.image_results / 'a-annoter.json',
                                        args.image_results / 'mesures.json')
    write_json(args.out / 'questions-pause.json', pause)
    write_json(args.out / 'observations-images.json', images)
    write_json(args.out / 'apres-notation' / 'mapping-questions-pause.json', pause_map)
    write_json(args.out / 'apres-notation' / 'mapping-observations-images.json', image_map)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
