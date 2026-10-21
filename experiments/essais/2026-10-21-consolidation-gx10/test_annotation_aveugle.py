"""Contrôle le scellage et la séparation des paquets d'annotation."""

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


SCRIPT = Path(__file__).with_name('annotation_aveugle.py')
SPEC = importlib.util.spec_from_file_location('annotation_aveugle', SCRIPT)
annotation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(annotation)


class AnnotationAveugleTest(unittest.TestCase):
    def test_real_inputs_produce_complete_blind_packets_and_reproducible_mapping(self):
        with tempfile.TemporaryDirectory() as temporary:
            first = Path(temporary) / 'first'
            second = Path(temporary) / 'second'
            self.assertEqual(annotation.main(['--out', str(first)]), 0)
            self.assertEqual(annotation.main(['--out', str(second)]), 0)
            for path in first.rglob('*.json'):
                self.assertEqual(path.read_bytes(), (second / path.relative_to(first)).read_bytes())

            pause = json.loads((first / 'questions-pause.json').read_text())
            images = json.loads((first / 'observations-images.json').read_text())
            pause_map = json.loads((first / 'apres-notation/mapping-questions-pause.json').read_text())
            image_map = json.loads((first / 'apres-notation/mapping-observations-images.json').read_text())
            self.assertFalse(pause['readyForScoring'])
            self.assertFalse(images['readyForScoring'])
            self.assertEqual(len(pause['questions']), 10)
            self.assertEqual(len(images['blocs']), 24)
            self.assertEqual(len(pause_map['rows']), 40)
            self.assertEqual(len(image_map['rows']), 96)
            for question in pause['questions']:
                self.assertEqual(len(question['reponses']), 4)
                for response in question['reponses']:
                    self.assertEqual(set(response), {'id', 'texte', 'note0a3', 'invention',
                                                     'preuve', 'justification'})
                    self.assertTrue(response['texte'])
                    self.assertTrue(all(response[key] is None for key in (
                        'note0a3', 'invention', 'preuve', 'justification')))
            for block in images['blocs']:
                self.assertEqual(len(block['sorties']), 4)
                for output in block['sorties']:
                    self.assertEqual(set(output), {'id', 'sujet', 'observation', 'ocr',
                                                   'actionBreve', 'faitsUtiles', 'invention'})
                    self.assertEqual(set(output['observation']), set(annotation.OBSERVATION_FIELDS))
                    self.assertTrue(all(output[key] is None for key in (
                        'ocr', 'actionBreve', 'faitsUtiles', 'invention')))
            for mapping in (pause_map, image_map):
                for row in mapping['rows']:
                    source = annotation.ROOT.parent.parent.parent / row['source']
                    self.assertEqual(annotation.read_json(source)[1], row['sourceSha256'])
                    self.assertIn(row['arm'], ('A', 'B'))
                    self.assertIn(row['passage'], (1, 2))
                    self.assertIsInstance(row['delayMs'], (int, float))
            self.assertNotIn('base64', (first / 'questions-pause.json').read_text())
            self.assertNotIn('base64', (first / 'observations-images.json').read_text())

    def test_incomplete_pause_set_is_rejected(self):
        paths = sorted(annotation.PAUSE_RESULTS.glob('*/run/campaign.json'))
        with self.assertRaisesRegex(ValueError, 'Huit campagnes'):
            annotation.pause_packets(paths[:-1])

    def test_encoded_media_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'média encodé'):
            annotation.require_text('data:image/png;base64,AAAA')


if __name__ == '__main__':
    unittest.main()
