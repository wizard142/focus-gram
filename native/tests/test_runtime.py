import importlib.util
from pathlib import Path
import shlex
import subprocess
import unittest
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('focus_runtime', Path(__file__).parents[1] / 'runtime.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)

class RuntimeTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        data = Path(directory.name)
        (data / 'state').mkdir()
        patcher = patch.object(runtime, 'DATA', data)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_remote_filenames_are_single_arguments(self):
        filename = "a space'; $(touch unexpected).png"
        with patch.object(runtime, 'adb', return_value=subprocess.CompletedProcess([], 0, 'ok', '')) as adb:
            runtime.shell('stat', filename)
        self.assertEqual(shlex.split(adb.call_args.args[1]), ['stat', filename])

    def test_focus_requires_acknowledgement(self):
        with patch.object(runtime, 'shell', return_value='Broadcast completed: result=0'):
            with self.assertRaisesRegex(RuntimeError, 'acknowledge'):
                runtime.Runtime().focus(True)

    def test_focus_rejects_permission_denial(self):
        with patch.object(runtime, 'shell', return_value='Permission Denial: data=enabled'):
            with self.assertRaises(RuntimeError):
                runtime.Runtime().focus(True)

    def test_failed_pause_is_not_recorded_as_paused(self):
        item = runtime.Runtime()
        with patch.object(runtime, 'console', side_effect=RuntimeError('unavailable')):
            with self.assertRaises(RuntimeError):
                item.pause(True)
        self.assertFalse(item.paused)

    def test_close_resumes_before_saving(self):
        item = runtime.Runtime()
        item.paused = True
        calls = []
        with patch.object(runtime, 'console', side_effect=lambda *args: calls.append(args)):
            item.close()
        self.assertEqual(calls, [('avd', 'resume'), ('kill',)])
        self.assertFalse(item.paused)

    def test_duplicate_minimize_does_not_send_duplicate_commands(self):
        item = runtime.Runtime()
        with patch.object(runtime, 'console') as console:
            item.pause(True)
            item.pause(True)
        self.assertEqual(console.call_count, 1)

    def test_close_waits_for_snapshot_before_parent_can_exit(self):
        from unittest.mock import Mock
        item = runtime.Runtime()
        item.process = Mock()
        with patch.object(runtime, 'console'):
            item.close()
        item.process.wait.assert_called_once_with(timeout=runtime.SHUTDOWN_TIMEOUT)

    def test_failed_detach_stops_guest_instead_of_leaving_it_hidden(self):
        item = runtime.Runtime()
        item.window, item.pid = 42, 123
        with patch.object(item, 'pause'), patch.object(item, 'close') as close:
            with patch.object(runtime, 'command', side_effect=RuntimeError('window disappeared')):
                with self.assertRaises(RuntimeError):
                    item.park(1)
        close.assert_called_once()

if __name__ == '__main__':
    unittest.main()
