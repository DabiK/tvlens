"""Contrats de préparation de la comparaison, sans fournisseur ni GPU."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


MODULE = Path(__file__).resolve().parents[1] / 'confirmation.py'
SPEC = importlib.util.spec_from_file_location('confirmation', MODULE)
trial = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(trial)
VERIFY_SPEC = importlib.util.spec_from_file_location('verifier_fermeture', MODULE.parents[0] / 'verifier_fermeture.py')
closure = importlib.util.module_from_spec(VERIFY_SPEC)
VERIFY_SPEC.loader.exec_module(closure)


class ConfirmationTests(unittest.TestCase):
    def test_package_sources_match_preregistration(self):
        self.assertEqual(len(trial.verify_package()['files']), 4)

    def test_arms_keep_all_inputs_and_change_only_pause(self):
        for video in trial.VIDEOS:
            base = trial.reference(video)
            arms = trial.scenarios(base)
            self.assertEqual(arms['A'], base)
            self.assertEqual(arms['B']['config']['visionDuringAsk'], False)
            alternate = copy.deepcopy(arms['B'])
            alternate['config']['visionDuringAsk'] = True
            self.assertEqual(alternate, base)
            self.assertEqual(len(base['questions']), 5)
        self.assertEqual(trial.ORDER, (('01-A', 'A'), ('02-B', 'B'), ('03-B', 'B'), ('04-A', 'A')))

    def test_reference_tampering_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'scenario.json'
            path.write_text('{}')
            with self.assertRaisesRegex(ValueError, 'SHA256_DIFFERENT'):
                trial.verified(path, trial.REFERENCE_SHA256['kennedy'])

    def test_campaign_requires_five_acquired_answers_and_released_session(self):
        scene = trial.reference('kennedy')
        report = {'complete': True, 'status': 'complete', 'runId': 'fixture',
                  'shutdown': {'archiveConfirmed': True, 'releaseConfirmed': True, 'errors': []},
                  'remaining': [], 'guardFailures': [], 'summary': {'lossCounts': {}},
                  'questions': [{'id': q['id'], 'status': 'done', 'acquired': True} for q in scene['questions']]}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'campaign.json'
            path.write_text(json.dumps(report))
            self.assertEqual(trial.validate_campaign(path, 'kennedy', scene)['runId'], 'fixture')
            report['questions'][2]['acquired'] = False
            path.write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError, 'CAMPAIGN_QUESTION_NOT_ACQUIRED'):
                trial.validate_campaign(path, 'kennedy', scene)
            report['questions'][2]['acquired'] = True
            report['shutdown']['releaseConfirmed'] = False
            path.write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError, 'CAMPAIGN_NOT_RELEASED'):
                trial.validate_campaign(path, 'kennedy', scene)

    def test_closure_seal_rejects_a_modified_result(self):
        expected_closure = {'complete': True, 'locksReleased': True, 'ownedProcessesStopped': True,
                            'containersCreated': False, 'completedPassages': 8, 'expectedPassages': 8,
                            'readyForScoring': False}
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            trial.write(root / 'closure.json', expected_closure)
            trial.write(root / 'status.json', {'status': 'finished'})
            files = {p.name: trial.digest(p) for p in root.iterdir()}
            trial.write(root / 'integrite.json', {'files': files})
            self.assertEqual(closure.verify_seal(root), trial.digest(root / 'integrite.json'))
            trial.write(root / 'status.json', {'status': 'blocked'})
            with self.assertRaisesRegex(ValueError, 'OUTPUT_INTEGRITY_DIFFERENT'):
                closure.verify_seal(root)

    def test_terminal_question_failure_stops_the_passage(self):
        self.assertFalse(trial.terminal_failure({'questions': [{'status': 'done'}]}))
        self.assertTrue(trial.terminal_failure({'questions': [{'status': 'refused'}]}))
        self.assertTrue(trial.terminal_failure({'guardFailures': [{'code': 'fixture'}]}))


if __name__ == '__main__':
    unittest.main()
