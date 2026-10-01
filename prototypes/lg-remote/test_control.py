"""Regression: webOS boot environments can leave sys.executable empty."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('remote_control', Path(__file__).with_name('control.py'))
control = importlib.util.module_from_spec(spec)
spec.loader.exec_module(control)

class BootInterpreterTest(unittest.TestCase):
    def test_empty_interpreter_still_launches_mapper(self):
        disabled = MagicMock()
        disabled.exists.return_value = False
        child = MagicMock(pid=123)
        with patch.object(control.sys, 'executable', ''), \
             patch.object(control, 'DISABLED', disabled), \
             patch.object(control, 'STATE', MagicMock()), \
             patch.object(control, 'owned_pid', side_effect=[None, 123]), \
             patch.object(control.subprocess, 'Popen', return_value=child) as launch:
            control.start()
        self.assertEqual(launch.call_args.args[0][0], '/usr/bin/python3')
        self.assertIn(control.ENTRY, launch.call_args.args[0])

if __name__ == '__main__':
    unittest.main()
