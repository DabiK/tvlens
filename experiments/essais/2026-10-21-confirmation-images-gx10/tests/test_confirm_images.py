"""Gardes et dérivation des entrées, sans fournisseur ni GPU."""
import base64
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/confirm_images.py'
SPEC = importlib.util.spec_from_file_location('confirm_images', SCRIPT)
experiment = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(experiment)


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value) + '\n')
    return experiment.digest(path.read_bytes())


class ConfirmationInputsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        source = self.root / 'reference/preparation-kennedy'
        frames = [{'atMs': n * 1600, 'dataUrl': 'data:image/jpeg;base64,' +
                   base64.b64encode(('frame-' + str(n)).encode()).decode()} for n in range(5)]
        media = {'startMs': 0, 'endMs': 8000, 'audio': None, 'frames': frames}
        media_path = source / 'blocks/000000/media.json'
        media_sha = save(media_path, media)
        case = {'id': 'video-0', 'startMs': 0, 'endMs': 8000,
                'media': {'path': 'blocks/000000/media.json', 'sha256': media_sha},
                'provenance': {'kind': 'converted-video'},
                'transcript': {'text': '', 'availability': 'unknown'},
                'context': {'value': None}}
        block = {'sequence': 0, 'startMs': 0, 'endMs': 8000}
        self.selection = {'arms': {'A': [0, 1, 2, 3, 4], 'B': [0, 2, 4]},
                          'videos': {'kennedy': {'cases': [{'sequence': 0, 'id': 'video-0',
                            'startMs': 0, 'endMs': 8000, 'media': case['media'],
                            'framesSha256': [experiment.digest(('frame-' + str(n)).encode()) for n in range(5)]}]}}}
        spec = self.selection['videos']['kennedy']
        spec['manifestSha256'] = save(source / 'manifest.json', {'cases': [case]})
        spec['blocksSha256'] = save(source / 'blocks.json', {'complete': True, 'blocks': [block]})
        spec['preparationSha256'] = save(source / 'preparation.json', {'complete': True})

    def test_same_frozen_frames_make_five_and_three_inputs(self):
        prepared = experiment.source_preflight(self.selection, self.root / 'reference')
        experiment.stage_inputs(self.root / 'result', self.selection, prepared)
        output = self.root / 'result/inputs'
        left = experiment.read(output / 'A/media/kennedy-video-0.json')
        right = experiment.read(output / 'B/media/kennedy-video-0.json')
        self.assertEqual([frame['atMs'] for frame in left['frames']], [0, 1600, 3200, 4800, 6400])
        self.assertEqual([frame['atMs'] for frame in right['frames']], [0, 3200, 6400])
        self.assertEqual(experiment.read(output / 'A/manifest.json')['cases'][0]['transcript'],
                         experiment.read(output / 'B/manifest.json')['cases'][0]['transcript'])

    def test_changed_source_media_is_refused_before_derivation(self):
        media_path = self.root / 'reference/preparation-kennedy/blocks/000000/media.json'
        media_path.write_bytes(media_path.read_bytes() + b' ')
        with self.assertRaisesRegex(ValueError, 'SHA_MISMATCH'):
            experiment.source_preflight(self.selection, self.root / 'reference')

    def test_predecessor_requires_seal_and_confirmed_cleanup(self):
        result = self.root / 'pause/results'
        result.mkdir(parents=True)
        save(result / 'status.json', {'status': 'finished', 'cleanupConfirmed': True})
        save(result / 'integrite.json', {'files': {'status.json': experiment.digest((result / 'status.json').read_bytes())}})
        self.assertEqual(experiment.verify_predecessor(self.root / 'pause')['statusSha256'],
                         experiment.digest((result / 'status.json').read_bytes()))
        save(result / 'status.json', {'status': 'blocked', 'cleanupConfirmed': True})
        with self.assertRaisesRegex(ValueError, 'SHA_MISMATCH'):
            experiment.verify_predecessor(self.root / 'pause')
        save(result / 'integrite.json', {'files': {'status.json': experiment.digest((result / 'status.json').read_bytes())}})
        with self.assertRaisesRegex(ValueError, 'PREDECESSOR_NOT_CLOSED'):
            experiment.verify_predecessor(self.root / 'pause')

    def test_prompt_template_allows_only_the_selected_timestamps_to_change(self):
        root = self.root / 'runs'
        for number, arm in enumerate(['A', 'B', 'B', 'A'], 1):
            cases = []
            for index in range(24):
                frames = [{'atMs': value} for value in self.selection['arms'][arm]]
                times = '[' + ','.join(str(frame['atMs']) for frame in frames) + ']'
                instructions = 'Décris le passage ; images horodatées ' + times + ' ; même gabarit.'
                cases.append({'id': str(index), 'status': 'succeeded', 'request': {
                    'instructions': instructions, 'frames': frames,
                    'promptSha256': experiment.digest(instructions.encode())},
                    'diagnostics': [{'metrics': {'providerTimings': {'promptEvalMs': 1}}}]})
            save(root / f'run-{number:02d}-{arm}/run/campaign.json', {'cases': cases})
            save(root / f'run-{number:02d}-{arm}/execution.json', {'durationSeconds': 24})
        self.assertTrue(experiment.summarize(root, self.selection))
        measures = experiment.read(root / 'mesures.json')['rows']
        self.assertEqual(len({row['normalizedPromptSha256'] for row in measures}), 1)
        self.assertEqual(experiment.read(root / 'mesures.json')['cadence'][0]['casesPerSecond'], 1)
        changed = root / 'run-02-B/run/campaign.json'
        report = experiment.read(changed)
        request = report['cases'][0]['request']
        request['instructions'] = request['instructions'].replace('même gabarit', 'gabarit changé')
        request['promptSha256'] = experiment.digest(request['instructions'].encode())
        save(changed, report)
        self.assertFalse(experiment.summarize(root, self.selection))

    def test_repo_guard_pins_runner_file_in_addition_to_head(self):
        runner = self.root / 'repo/scripts/replay-local-perception.cjs'
        runner.parent.mkdir(parents=True)
        shutil.copyfile(Path(__file__).resolve().parents[4] / 'scripts/replay-local-perception.cjs', runner)
        with mock.patch.object(experiment.subprocess, 'check_output', return_value=experiment.CODE_SHA + '\n'):
            self.assertEqual(experiment.verify_repo(runner.parents[1]), experiment.CODE_SHA)
            runner.write_bytes(runner.read_bytes() + b' ')
            with self.assertRaisesRegex(ValueError, 'SHA_MISMATCH'):
                experiment.verify_repo(runner.parents[1])


if __name__ == '__main__':
    unittest.main()
