"""Le lanceur refuse un paquet extrait qui ne correspond plus à son archive."""
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest


COMMON = Path(__file__).resolve().parents[1] / 'common.sh'


def check_package(archive, package):
    return subprocess.run(
        ['bash', '-c', 'source "$1"; require_package_payload "$2" "$3"',
         'test', str(COMMON), str(archive), str(package)],
        capture_output=True, text=True, check=False,
    )


class PackageIntegrityTests(unittest.TestCase):
    def test_accepts_matching_archive_and_rejects_changed_extraction(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            package = root / 'package'
            package.mkdir()
            script = package / 'queue.py'
            script.write_text('print("original")\n')
            archive = root / 'package.tar.gz'
            with tarfile.open(archive, 'w:gz') as output:
                output.add(script, arcname='queue.py')

            self.assertEqual(check_package(archive, package).returncode, 0)
            script.write_text('print("modified")\n')
            result = check_package(archive, package)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('PACKAGE_CONTENT_MISMATCH', result.stderr)


if __name__ == '__main__':
    unittest.main()
