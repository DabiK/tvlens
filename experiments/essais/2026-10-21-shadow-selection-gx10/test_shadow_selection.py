import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from shadow_selection import analyze


def write_preparation(root, block_colors):
    blocks = []
    for sequence, colors in enumerate(block_colors):
        outputs = []
        for index, color in enumerate(colors):
            path = Path("blocks") / f"{sequence:06d}" / f"frame-{index}.jpg"
            target = root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            Image.new("RGB", (64, 36), color).save(target, quality=95)
            outputs.append({"path": str(path), "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
        blocks.append({"sequence": sequence, "startMs": sequence * 8000,
                       "endMs": (sequence + 1) * 8000, "outputs": outputs})
    (root / "blocks.json").write_text(json.dumps({"blocks": blocks}), encoding="utf-8")


class ShadowSelectionTest(unittest.TestCase):
    def test_static_candidate_is_bounded_and_never_removes_a_call(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_preparation(root, [[(80, 80, 80)] * 5] * 3)
            result = analyze(root)
            self.assertEqual([False, True, False], [block["shadowSkipCandidate"] for block in result["blocks"]])
            self.assertEqual(0, result["summary"]["actualVlmCallsRemoved"])
            self.assertTrue(all(block["selectedIndices"] == [0, 1, 4] for block in result["blocks"]))

    def test_detected_unselected_change_falls_back_to_all_frames(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            colors = [(0, 0, 0), (255, 255, 255), (0, 0, 0), (128, 128, 128), (0, 0, 0)]
            write_preparation(root, [colors])
            result = analyze(root)
            block = result["blocks"][0]
            self.assertEqual([0, 1, 4], block["proposedIndices"])
            self.assertEqual([3], block["unselectedChangeProxyIndices"])
            self.assertEqual([0, 1, 2, 3, 4], block["selectedIndices"])
            self.assertEqual("unselected-change-proxy", block["fallbackReason"])

    def test_hash_mismatch_rejects_input(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_preparation(root, [[(80, 80, 80)] * 5])
            (root / "blocks/000000/frame-0.jpg").write_bytes(b"modified")
            with self.assertRaisesRegex(ValueError, "SHA-256 incorrect"):
                analyze(root)


if __name__ == "__main__":
    unittest.main()
