"""Vérifie les dénominateurs et les appariements du bilan local."""

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


SCRIPT = Path(__file__).with_name('bilan.py')
SPEC = importlib.util.spec_from_file_location('bilan', SCRIPT)
bilan = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bilan)


class BilanTest(unittest.TestCase):
    def test_pause_uses_planned_denominator_and_pairs_same_questions(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            paths = []
            for video in ('kennedy', 'spring'):
                ids = bilan.planned_questions(video)
                for order, (arm, _) in bilan.ORDER.items():
                    folder = root / f'{video}-{order}-{arm}' / 'run'
                    folder.mkdir(parents=True)
                    questions = []
                    for identifier in ids:
                        acquired = not (video == 'kennedy' and order == '02' and identifier == ids[0])
                        questions.append({
                            'id': identifier, 'status': 'done' if acquired else 'error', 'acquired': acquired,
                            'result': {'kind': 'insufficient' if video == 'kennedy' and order == '03' and identifier == ids[0]
                                       else 'observation'},
                            'latency': {'submissionToHttpResponseMs': 18000 if arm == 'A' else 14000,
                                        'internal': {'evidence': {'anchorMs': 10000, 'analyzedThroughMs': 8000}}},
                        })
                    campaign = {'mode': 'execution', 'complete': True, 'status': 'complete',
                                'questions': questions, 'summary': {
                                    'coverage': {'vision': {'percent': 75}},
                                    'losses': {'vision': {'byCause': {'asking': 1}}}}}
                    path = folder / 'campaign.json'
                    path.write_text(json.dumps(campaign))
                    paths.append(path)
            result = bilan.pause_report(paths)
            kennedy_b1 = next(row for row in result['passages'] if (row['video'], row['bras'], row['passage']) == ('kennedy', 'B', 1))
            self.assertEqual(kennedy_b1['mesures']['nonAcquis'], 1)
            self.assertEqual(kennedy_b1['mesures']['insufficient'], 0)
            kennedy_b2 = next(row for row in result['passages'] if (row['video'], row['bras'], row['passage']) == ('kennedy', 'B', 2))
            self.assertEqual(kennedy_b2['mesures']['insufficient'], 1)
            self.assertEqual(kennedy_b1['mesures']['sous15'], {'nombre': 4, 'denominateur': 5})
            self.assertEqual(kennedy_b1['mesures']['agePreuveAnalyseMs']['p50'], 2000)
            self.assertEqual(kennedy_b1['pertesParCause']['vision']['asking'], 1)
            pair = next(row for row in result['appariements'] if row['video'] == 'kennedy' and row['passage'] == 1)
            self.assertIsNone(pair['differenceBmoinsAMs'])
            self.assertEqual(len(result['appariements']), 20)
            output = root / 'bilan.json'
            args = [item for path in paths for item in ('--campaign', str(path))]
            self.assertEqual(bilan.main(args + ['--out', str(output)]), 0)
            self.assertEqual(json.loads(output.read_text())['images']['etat'], 'en_attente')
            self.assertFalse(json.loads(output.read_text())['readyForScoring'])

    def test_images_pair_same_block_and_keep_passages_separate(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'mesures.json'
            selection = bilan.read(bilan.IMAGE_SELECTION)
            rows = []
            cadence = []
            for order, (arm, _) in bilan.ORDER.items():
                cadence.append({'run': f'run-{order}-{arm}', 'arm': arm, 'cases': 24,
                                'durationSeconds': 120, 'casesPerSecond': 0.2})
                for video, spec in selection['videos'].items():
                    for case in spec['cases']:
                        rows.append({'run': f'run-{order}-{arm}', 'arm': arm,
                                     'id': video + '-' + case['id'], 'status': 'succeeded',
                                     'providerTimings': [{'totalMs': 20 if arm == 'A' else 15,
                                                          'loadMs': 1, 'promptEvalMs': 8, 'evalMs': 6,
                                                          'promptTokens': 100, 'evalTokens': 20}],
                                     'clientTimings': [{'requestMs': 22 if arm == 'A' else 17,
                                                        'queueMs': 2}]})
            path.write_text(json.dumps({'readyForScoring': False, 'cadence': cadence, 'rows': rows}))
            result = bilan.image_report(path)
            self.assertEqual(result['etat'], 'complet')
            self.assertEqual(len(result['passages']), 8)
            self.assertEqual(len(result['appariementsParBloc']), 48)
            self.assertEqual(result['appariementsParBloc'][0]['difference3moins5']['fournisseurTotalMs'], -5)
            self.assertEqual(result['appariementsParBloc'][0]['difference3moins5']['clientRequeteMs'], -5)
            self.assertEqual(result['resumeApparie'][0]['parMesure']['clientFilePlusRequeteMs']['p95'], -5)
            self.assertEqual(result['cadenceParPassage'][0]['casParSeconde'], 0.2)


if __name__ == '__main__':
    unittest.main()
