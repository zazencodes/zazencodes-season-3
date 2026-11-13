import contextlib
import importlib.util
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('factory', Path(__file__).with_name('factory.py'))
factory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(factory)


class DispatchTests(unittest.TestCase):
    def test_two_issues_use_separate_workers_in_order(self):
        self.exercise(['done', 'done'], [8, 10])

    def test_stopped_worker_halts_batch(self):
        self.exercise(['stopped', 'done'], [8])

    def exercise(self, outcomes, expected):
        with tempfile.TemporaryDirectory() as tmp:
            slug = 'owner/repo'
            repo = {'repo': slug, 'path': tmp, 'base': 'main'}
            waiting = [{'number': n, 'title': str(n)} for n in (8, 10)]
            calls = []
            def start(args):
                number = args.issue
                factory.save(factory.job_dir(slug, number) / 'job.json', {
                    'repo': slug, 'path': tmp, 'issue': number, 'state': 'active',
                    'stage': 'ingest', 'events': [], 'branch': f'factory/issue-{number}'})
            def worker(command, **kwargs):
                number = (8, 10)[len(calls)]
                calls.append(command)
                self.assertNotIn('--source', command)
                self.assertIn('--oneshot', command)
                self.assertIn('factory', command)
                self.assertNotIn('--resume', command)
                self.assertNotIn('--continue', command)
                self.assertNotIn('HERMES_SESSION_ID', kwargs['env'])
                p = factory.job_dir(slug, number) / 'job.json'
                job = json.loads(p.read_text())
                job['state'] = outcomes[len(calls)-1]
                factory.save(p, job)
                return SimpleNamespace(returncode=0)
            with patch.dict(os.environ, HERMES_HOME=tmp, HERMES_SESSION_ID='parent'), \
                 patch.object(factory, 'load_repo', return_value=repo), \
                 patch.object(factory, 'check_queue', return_value=waiting), \
                 patch.object(factory, 'start', side_effect=start), \
                 patch.object(factory.subprocess, 'run', side_effect=worker), \
                 contextlib.redirect_stdout(io.StringIO()):
                if outcomes[0] == 'stopped':
                    with self.assertRaises(SystemExit):
                        factory.dispatch(SimpleNamespace(repo=slug))
                else:
                    factory.dispatch(SimpleNamespace(repo=slug))
                self.assertEqual(len(calls), len(expected))
                for number, command in zip(expected, calls):
                    self.assertIn(f'issue #{number}', command[-1])


if __name__ == '__main__':
    unittest.main()
