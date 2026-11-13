import importlib.util
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


class ResumeTests(unittest.TestCase):
    def test_resume_preserves_work_and_stage(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            slug = 'owner/repo'
            job = {'repo': slug, 'path': '/clone', 'issue': 7,
                   'branch': 'factory/issue-7', 'state': 'stopped',
                   'stage': 'validate', 'events': [], 'updated': 'old'}
            with patch.dict(os.environ, HERMES_HOME=tmp):
                factory.save(factory.repo_file(slug), {'repo': slug, 'path': '/clone'})
                factory.save(factory.job_dir(slug, 7) / 'job.json', job)
                with patch.object(factory, 'run', return_value='factory/issue-7') as run:
                    factory.resume(SimpleNamespace(repo=slug, issue=7))
                saved = json.loads((factory.job_dir(slug, 7) / 'job.json').read_text())
                self.assertEqual(saved['state'], 'active')
                self.assertEqual(saved['stage'], 'validate')
                run.assert_called_once_with('git', 'branch', '--show-current', cwd='/clone')

    def test_resume_rejects_wrong_branch(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(os.environ, HERMES_HOME=tmp):
                slug = 'owner/repo'
                factory.save(factory.repo_file(slug), {'repo': slug, 'path': '/clone'})
                factory.save(factory.job_dir(slug, 7) / 'job.json', {
                    'repo': slug, 'path': '/clone', 'issue': 7, 'branch': 'factory/issue-7',
                    'state': 'stopped', 'stage': 'validate', 'events': []})
                with patch.object(factory, 'run', return_value='main'):
                    with self.assertRaises(SystemExit):
                        factory.resume(SimpleNamespace(repo=slug, issue=7))


if __name__ == '__main__':
    unittest.main()
